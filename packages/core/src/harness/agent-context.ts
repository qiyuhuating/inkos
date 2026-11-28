import { createHash } from "node:crypto";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { Message, UserMessage } from "@mariozechner/pi-ai";
import { estimatePiContextTokens } from "../llm/provider.js";
import type { ContextCompressionCallback } from "../models/context-compression.js";
import {
  compileContext,
  ContextSourceRegistry,
  ProtectedContextOverflowError,
  type ContextFragment,
  type SemanticContextCompiler,
} from "./context-compiler.js";
import type { WorkManifest, WorkProfile } from "./contracts.js";
import { loadWorkManifest } from "./work-store.js";
import type { ConversationCheckpoint, ConversationCheckpointStore } from "./conversation-checkpoint.js";
import {executionProgress} from './execution-progress.js';
import { compactArchivedObservation } from "../agent/archived-observation.js";

export interface ConversationCompactionRequest {
  readonly history: string;
  readonly intent: string;
  readonly maxTokens: number;
  readonly signal?: AbortSignal;
}

export type ConversationCompactor = (request: ConversationCompactionRequest) => Promise<string>;

export interface HarnessContextWindow {
  (messages: AgentMessage[], signal?: AbortSignal): Promise<AgentMessage[]>;
  restoreWindow(messages: AgentMessage[]): Promise<AgentMessage[]>;
  releaseCommittedHistory(messages: AgentMessage[]): AgentMessage[];
  compactedCount(): number;
  checkpoint(): ConversationCheckpoint | undefined;
  restoreVerifiedWindow(checkpoint: ConversationCheckpoint, messages: AgentMessage[]): AgentMessage[];
}

export function createHarnessContextTransform(input: {
  readonly projectRoot: string;
  readonly work: WorkManifest | null;
  readonly profile: WorkProfile;
  readonly budgetTokens: number;
  readonly semanticCompiler?: SemanticContextCompiler;
  readonly conversationCompactor?: ConversationCompactor;
  readonly onContextCompression?: ContextCompressionCallback;
  /** Pi passes completed, immutable messages at the transport boundary. */
  readonly immutableCompletedMessages?: boolean;
  readonly checkpoint?: ConversationCheckpointStore;
  readonly projectCompletedHistory?: (messages: AgentMessage[]) => AgentMessage[];
  /** True only when the model has the session-scoped archive recovery tool. */
  readonly compactActiveArchives?: boolean;
  /** Retire shared payloads only after the original observation is persisted. */
  readonly retireArchivedObservation?: (message: AgentMessage,replacement: AgentMessage) => boolean;
}): HarnessContextWindow {
  const sources = new ContextSourceRegistry();
  sources.register({
    id: "work-current",
    async load(request) {
      const work = request.work;
      if (!work) return [];
      return [{
        id: "work-identity",
        source: "current Work",
        protection: "protected",
        priority: 100,
        pointer: `works/${work.id}/work.json`,
        content: JSON.stringify({
          id: work.id,
          title: work.title,
          profileId: work.profileId,
          language: work.language,
          status: work.status,
          lineage: work.lineage,
          metadata: work.metadata,
          artifacts: work.artifacts.map((artifact) => ({
            id: artifact.id,
            kind: artifact.kind,
            path: artifact.revisions.find(revision=>revision.id===artifact.currentRevisionId)?.path,
            schema: input.profile.artifactSchemas[artifact.revisions.find(revision=>revision.id===artifact.currentRevisionId)?.path ?? ""],
            currentRevisionId: artifact.currentRevisionId,
            read: { artifactId: artifact.id },
          })),
        }),
      }];
    },
  });

  const metrics = new MessageMetrics(input.immutableCompletedMessages === true);
  const archiveProjections = new WeakMap<AgentMessage,AgentMessage>();
  const projectArchive = (message:AgentMessage):AgentMessage => {
    if(!input.immutableCompletedMessages)return compactArchivedObservation(message);
    const previous=archiveProjections.get(message);
    if(previous)return previous;
    const projected=compactArchivedObservation(message);
    archiveProjections.set(message,projected);
    return projected;
  };
  const estimateAgentMessages = (messages: readonly AgentMessage[]) => metrics.estimate(messages);
  let cached: ConversationCheckpoint | undefined;
  let stableCached: ConversationCheckpoint | undefined;
  let checkpointLoaded = false;
  // A verified checkpoint owns the omitted disk prefix. Only its digest,
  // count and summary remain in memory after release.
  let base: ConversationCheckpoint | undefined;
  let releaseCount = 0;
  let projection: {source: AgentMessage[]; messages: AgentMessage[]} | undefined;
  const baseCount = () => base?.count ?? 0;
  const matches = (checkpoint: ConversationCheckpoint | undefined, history: readonly AgentMessage[]): checkpoint is ConversationCheckpoint => {
    const count = (checkpoint?.count ?? 0) - baseCount();
    return Boolean(checkpoint && count >= 0 && count <= history.length && checkpoint.digest === metrics.digest(history,count,base?.digest));
  };
  const summaryFrame = (summary: string): UserMessage => ({role:"user",content:`<conversation_summary>\n${summary}\n</conversation_summary>`,timestamp:Date.now()});
  const transform = async (messages: AgentMessage[], signal?: AbortSignal): Promise<AgentMessage[]> => {
    const lastUserIndex = findLastUserIndex(messages);
    const sourceHistory = lastUserIndex > 0 ? messages.slice(0, lastUserIndex) : [];
    if (!input.immutableCompletedMessages || !projection || projection.source.length !== sourceHistory.length || sourceHistory.some((message,index)=>message!==projection!.source[index])) {
      projection = {source:sourceHistory,messages:input.projectCompletedHistory?.(sourceHistory) ?? sourceHistory};
    }
    const completedHistory = projection.messages;
    let historicalMessages = completedHistory;
    const originalTail = lastUserIndex >= 0 ? messages.slice(lastUserIndex) : messages;
    // Pi owns several arrays of the same completed message objects during a
    // run. Release older archived read payloads through their shared object,
    // not by mutating/splicing any Pi-owned message array.
    let latestAssistant=-1;
    for(let i=originalTail.length-1;i>=0;i--)if(originalTail[i]?.role==="assistant"){latestAssistant=i;break;}
    if(input.compactActiveArchives&&input.retireArchivedObservation&&latestAssistant>0){
      for(let i=0;i<latestAssistant;i++){
        const message=originalTail[i]!;
        const replacement=projectArchive(message);
        if(replacement!==message&&input.retireArchivedObservation(message,replacement)) {
          metrics.invalidate(message);
          archiveProjections.set(message,message);
        }
      }
    }
    const referenceTail = input.compactActiveArchives ? originalTail.map(projectArchive) : originalTail;
    let protectedTail = referenceTail;
    // Completed reads in the current tool loop can exceed a model window even
    // with a short user request. Preserve the request; compact the complete
    // closed tool exchanges, keeping their full evidence in the transcript.
    if (lastUserIndex >= 0 && estimateAgentMessages(protectedTail) > input.budgetTokens * 0.6
      && input.conversationCompactor && closedToolExchanges(protectedTail.slice(1))) {
      let boundary=protectedTail.length;
      let suffixUnits=0;
      const calls=new Set<string>(), results=new Set<string>();
      let unmatched=0;
      for(let i=protectedTail.length-1;i>=1;i--){
        const message=protectedTail[i]!;
        suffixUnits += metrics.units(message)+(i===protectedTail.length-1?0:1);
        if(Math.ceil(suffixUnits/4)>=input.budgetTokens*0.2)break;
        if(message.role==="toolResult"&&!results.has(message.toolCallId)){
          results.add(message.toolCallId);unmatched+=calls.has(message.toolCallId)?-1:1;
        }
        if(message.role==="assistant"){
          for(const part of message.content)if(part.type==="toolCall"&&!calls.has(part.id)){
            calls.add(part.id);unmatched+=results.has(part.id)?-1:1;
          }
          if(calls.size>0&&unmatched===0)boundary=i;
        }
      }
      historicalMessages = [...historicalMessages, ...protectedTail.slice(1,boundary)];
      protectedTail = [messages[lastUserIndex]!,...protectedTail.slice(boundary)];
    }
    const tailTokens = estimateAgentMessages(protectedTail);
    const workBudget = input.budgetTokens - tailTokens;
    if (workBudget <= 0) throw new ProtectedContextOverflowError(tailTokens, input.budgetTokens);

    const currentWork = input.work ? await loadWorkManifest(input.projectRoot, input.work.id) : null;
    const compiled = await compileContext({
      recipe: { id: `${input.profile.id}-agent`, sourceIds: ["work-current"] },
      sources,
      request: {
        projectRoot: input.projectRoot,
        work: currentWork,
        profile: input.profile,
        actionId: "agent-turn",
        intent: latestUserText(messages),
        signal,
      },
      budgetTokens: workBudget,
      compiler: input.semanticCompiler,
    });
    const contextMessage: UserMessage | null = compiled.markdown
      ? {
          role: "user",
          content: `<current_work_context>\n${compiled.markdown}\n</current_work_context>`,
          timestamp: Date.now(),
        }
      : null;
    const progress=executionProgress(messages.slice(lastUserIndex>=0?lastUserIndex+1:0),Math.max(100,Math.min(8000,Math.floor(input.budgetTokens*0.6))));
    const progressMessage:UserMessage|undefined=progress?{role:'user',content:`<host_execution_progress>\n${progress}\n</host_execution_progress>`,timestamp:Date.now()}:undefined;
    // Use a newly verified stable checkpoint immediately, even before the
    // current request commits and releases its physical history.
    const stable = matches(stableCached,completedHistory) ? stableCached : base;
    const retainedHistory = stable ? completedHistory.slice(stable.count-baseCount()) : completedHistory;
    const prefix = [...(contextMessage ? [contextMessage as AgentMessage] : []),
      ...(stable ? [summaryFrame(stable.summary)] : []),
      ...retainedHistory, ...(progressMessage ? [progressMessage] : [])];
    const withContext = [...prefix,...originalTail];
    if (estimateAgentMessages(withContext) <= input.budgetTokens) return withContext;
    // Prefer addressable evidence over lossy semantic compression. The newest
    // result keeps its full preview whenever it fits; otherwise the model can
    // request the original bytes explicitly instead of spending a summary call.
    const withReferences = [...prefix,...referenceTail];
    if (estimateAgentMessages(withReferences) <= input.budgetTokens) return withReferences;

    if (!input.conversationCompactor || (historicalMessages.length === 0 && !base)) {
      throw new ProtectedContextOverflowError(
        estimateAgentMessages(contextMessage ? [contextMessage as AgentMessage, ...protectedTail] : protectedTail),
        input.budgetTokens,
      );
    }

    const workTokens = contextMessage ? estimateAgentMessages([contextMessage as AgentMessage]) : 0;
    const progressTokens=progressMessage?estimateAgentMessages([progressMessage]):0;
    const summaryBudget = input.budgetTokens - workTokens - tailTokens-progressTokens;
    if (summaryBudget <= 0) {
      throw new ProtectedContextOverflowError(workTokens + tailTokens, input.budgetTokens);
    }
    if (!checkpointLoaded) {
      stableCached = await input.checkpoint?.load();
      cached = stableCached;
      checkpointLoaded = true;
    }
    if (!matches(cached,historicalMessages)) cached = matches(stableCached,historicalMessages) ? stableCached : base;
    const extendsCache=Boolean(cached);
    const delta=extendsCache?historicalMessages.slice(cached!.count-baseCount()):historicalMessages;
    const cachedTokens=extendsCache?estimateAgentMessages([summaryFrame(cached!.summary),...delta]):Infinity;
    let summary:string;
    let retainedDelta:AgentMessage[]=[];
    let nextCheckpoint: ConversationCheckpoint | undefined;
    if(extendsCache&&cachedTokens+4<=summaryBudget){summary=cached!.summary;retainedDelta=delta;}
    else {
    input.onContextCompression?.({ category: "session_context", phase: "start", sources: ["session transcript"] });
    summary = (await input.conversationCompactor({
      history: extendsCache?`Previous notes (not execution authority):\n${cached!.summary}\n\nNew completed exchanges:\n${renderAgentMessages(delta)}`:renderAgentMessages(historicalMessages),
      intent: latestUserText(messages),
      // Keep headroom for several new exchanges rather than filling the window with notes.
      maxTokens: Math.max(1, Math.min(summaryBudget-16, Math.floor(input.budgetTokens*0.25))),
      signal,
    })).trim();
    if (!summary) throw new Error("Conversation compactor returned empty content");
    nextCheckpoint={count:baseCount()+historicalMessages.length,digest:metrics.digest(historicalMessages,historicalMessages.length,base?.digest),summary};
    input.onContextCompression?.({ category: "session_context", phase: "end", sources: ["session transcript"] });
    }
    const summaryMessage = summaryFrame(summary);
    const finalMessages = [
      ...(contextMessage ? [contextMessage as AgentMessage] : []),
      summaryMessage,
      ...retainedDelta,
      ...(progressMessage?[progressMessage]:[]),
      ...protectedTail,
    ];
    const finalTokens = estimateAgentMessages(finalMessages);
    if (finalTokens > input.budgetTokens) {
      throw new Error(`Compacted conversation still exceeds budget: ${finalTokens}/${input.budgetTokens} tokens`);
    }
    if (nextCheckpoint) {
      // Active-loop summaries omit the current user message and thus are not
      // a prefix of committed history. Never replace a durable checkpoint with one.
      if (historicalMessages === completedHistory) {
        await input.checkpoint?.save(nextCheckpoint);
        stableCached = nextCheckpoint;
        releaseCount = sourceHistory.length;
      }
      cached = nextCheckpoint;
    }
    return finalMessages;
  };
  return Object.assign(transform, {
    async restoreWindow(messages: AgentMessage[]): Promise<AgentMessage[]> {
      if (!input.checkpoint) return messages;
      stableCached = await input.checkpoint.load();
      checkpointLoaded = true;
      if (!matches(stableCached,messages)) { stableCached = undefined; return messages; }
      base = cached = stableCached;
      return messages.slice(base.count);
    },
    releaseCommittedHistory(messages: AgentMessage[]): AgentMessage[] {
      if (!stableCached || stableCached.count <= baseCount()) return messages;
      if (releaseCount <= 0 || releaseCount > messages.length) return messages;
      const prefix = messages.slice(0,releaseCount);
      const normalized = input.projectCompletedHistory?.(prefix) ?? prefix;
      if (normalized.length !== stableCached.count-baseCount() || !matches(stableCached,normalized)) return messages;
      const remaining = messages.slice(releaseCount);
      base = cached = stableCached;
      projection = undefined;
      releaseCount = 0;
      return remaining;
    },
    compactedCount: baseCount,
    checkpoint: () => base,
    restoreVerifiedWindow(checkpoint: ConversationCheckpoint,messages: AgentMessage[]): AgentMessage[] {
      base = cached = stableCached = checkpoint;
      checkpointLoaded = true;
      return messages;
    },
  });
}

function closedToolExchanges(messages: ReadonlyArray<AgentMessage>): boolean {
  const calls = new Set<string>();
  const results = new Set<string>();
  for (const message of messages) {
    if (message.role === "assistant") {
      for (const block of message.content) if (block.type === "toolCall") calls.add(block.id);
    } else if (message.role === "toolResult") results.add(message.toolCallId);
  }
  return calls.size > 0 && calls.size === results.size && [...calls].every((id) => results.has(id));
}

function findLastUserIndex(messages: ReadonlyArray<AgentMessage>): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if ((messages[index] as { role?: string }).role === "user") return index;
  }
  return -1;
}

class MessageMetrics {
  private readonly cache = new WeakMap<AgentMessage, { units: number; hash: string }>();
  constructor(private readonly immutable: boolean) {}
  private measure(message: AgentMessage) {
    const previous = this.immutable ? this.cache.get(message) : undefined;
    if (previous) return previous;
    const frame = renderAgentMessage(message);
    let cjk = 0;
    for (let i = 0; i < frame.length; i++) { const code = frame.charCodeAt(i); if (code >= 0x3400 && code <= 0x9fff) cjk++; }
    const transportUnits = ["user","assistant","toolResult"].includes(message.role)
      ? 4 * estimatePiContextTokens({messages:[message as Message]}) : 0;
    const value = { units: Math.max(frame.length + 3 * cjk, transportUnits), hash: createHash("sha256").update(frame).digest("hex") };
    if (this.immutable) this.cache.set(message, value);
    return value;
  }
  invalidate(message: AgentMessage): void { this.cache.delete(message); }
  units(message: AgentMessage): number { return this.measure(message).units; }
  estimate(messages: readonly AgentMessage[]): number {
    let units = Math.max(0, messages.length - 1);
    for (const message of messages) units += this.units(message);
    return Math.ceil(units / 4);
  }
  digest(messages: readonly AgentMessage[], count: number, prefix?: string): string {
    let digest = prefix ?? createHash("sha256").update("").digest("hex");
    for (let index = 0; index < count; index++) {
      digest = extendDigest(digest,this.measure(messages[index]!).hash);
    }
    return digest;
  }
}

function extendDigest(prefix: string, frameHash: string): string {
  return createHash("sha256").update(prefix).update(frameHash).digest("hex");
}

/** Same canonical chain used by in-memory and streamed prefix validation. */
export function digestConversationMessages(messages: readonly AgentMessage[], prefix?: string): string {
  let digest = prefix ?? createHash("sha256").update("").digest("hex");
  for (const message of messages) digest = extendDigest(digest,createHash("sha256").update(renderAgentMessage(message)).digest("hex"));
  return digest;
}

function renderAgentMessage(message: AgentMessage): string {
  // UI details often repeat the full tool payload. Pi sends content to the
  // model; counting details/cost/signature metadata can double the budget.
  const raw = message as {role:string;content?:unknown;toolCallId?:string;toolName?:string;isError?:boolean};
  return JSON.stringify({role:raw.role,content:raw.content,
    ...(raw.role === "toolResult" ? {toolCallId:raw.toolCallId,toolName:raw.toolName,isError:raw.isError} : {}),
  });
}

function renderAgentMessages(messages: readonly AgentMessage[]): string {
  return messages.map(renderAgentMessage).join("\n");
}

function latestUserText(messages: ReadonlyArray<AgentMessage>): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as { role?: string; content?: unknown };
    if (message.role !== "user") continue;
    if (typeof message.content === "string") return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .filter((item): item is { type: "text"; text: string } => (
          Boolean(item) && typeof item === "object" && item.type === "text" && typeof item.text === "string"
        ))
        .map((item) => item.text)
        .join("\n");
    }
  }
  return "";
}
