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
import { ExecutionProgressLedger, executionProgress } from './execution-progress.js';
import { compactArchivedObservation } from "../agent/archived-observation.js";

export interface ConversationCompactionRequest {
  readonly history: string;
  readonly intent: string;
  readonly scope?: "stable" | "active";
  readonly maxTokens: number;
  readonly signal?: AbortSignal;
}

export type ConversationCompactor = (request: ConversationCompactionRequest) => Promise<string>;

export interface HarnessContextWindow {
  (messages: AgentMessage[], signal?: AbortSignal): Promise<AgentMessage[]>;
  restoreWindow(messages: AgentMessage[]): Promise<AgentMessage[]>;
  releaseCommittedHistory(messages: AgentMessage[]): AgentMessage[];
  compactedCount(): number;
  beginRequest(): void;
  captureCommittedTask(messages: AgentMessage[]): ConversationCheckpoint | undefined;
  persistCommittedTask(candidate: ConversationCheckpoint): Promise<boolean>;
  discardCommittedTask(): void;
  recordExecutionMessage(message: AgentMessage): void;
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
  /** Only enable when every completed message is supplied by the host event stream. */
  readonly trackExecutionEvents?: boolean;
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
  let stableCached: ConversationCheckpoint | undefined;
  // Active notes are scoped to one request, not the durable history chain.
  let activeCached: (ConversationCheckpoint & { userDigest: string }) | undefined;
  let committedTask: ConversationCheckpoint | undefined;
  let persistedTask: ConversationCheckpoint | undefined;
  const progressBudget=Math.max(100,Math.min(8000,Math.floor(input.budgetTokens*0.6)));
  let ledger=new ExecutionProgressLedger(progressBudget);
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
  const summaryFrame = (summary: string): UserMessage => ({role:"user",content:`<conversation_summary>\n${escapeNoteMarkup(summary)}\n</conversation_summary>`,timestamp:Date.now()});
  const transform = async (messages: AgentMessage[], signal?: AbortSignal): Promise<AgentMessage[]> => {
    const lastUserIndex = findLastUserIndex(messages);
    const sourceHistory = lastUserIndex > 0 ? messages.slice(0, lastUserIndex) : [];
    if (!input.immutableCompletedMessages || !projection || projection.source.length !== sourceHistory.length || sourceHistory.some((message,index)=>message!==projection!.source[index])) {
      projection = {source:sourceHistory,messages:input.projectCompletedHistory?.(sourceHistory) ?? sourceHistory};
    }
    const completedHistory = projection.messages;
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
    const currentUser = lastUserIndex >= 0 ? referenceTail[0] : undefined;
    const activeRecords = currentUser ? referenceTail.slice(1) : [];
    const userDigest = currentUser ? createHash("sha256").update(renderAgentMessage(currentUser)).update(String(currentUser.timestamp)).digest("hex") : "";
    if (activeCached && (activeCached.userDigest !== userDigest || activeCached.count > activeRecords.length
      || metrics.digest(activeRecords,activeCached.count) !== activeCached.digest)) activeCached = undefined;
    const activeCount = activeCached?.count ?? 0;
    const activeFrame = (summary:string):UserMessage => ({role:"user",content:"<active_task_summary>\n"+escapeNoteMarkup(summary)+"\n</active_task_summary>",timestamp:Date.now()});
    let boundary=activeCount+1;
    let protectedTail = currentUser ? [currentUser,...referenceTail.slice(boundary)] : referenceTail;
    // Completed reads in the current tool loop can exceed a model window even
    // with a short user request. Preserve the request; compact the complete
    // closed tool exchanges, keeping their full evidence in the transcript.
    if (lastUserIndex >= 0 && estimateAgentMessages(protectedTail) > input.budgetTokens * 0.6
      && input.conversationCompactor && closedToolExchanges(protectedTail.slice(1))) {
      let cut=protectedTail.length;
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
          if(calls.size>0&&unmatched===0)cut=i;
        }
      }
      boundary=activeCount+cut;
      protectedTail = [messages[lastUserIndex]!,...protectedTail.slice(cut)];
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
    const progress=input.trackExecutionEvents ? ledger.render() : executionProgress(messages.slice(lastUserIndex>=0?lastUserIndex+1:0),progressBudget);
    const progressMessage:UserMessage|undefined=progress?{role:'user',content:`<host_execution_progress>\n${progress}\n</host_execution_progress>`,timestamp:Date.now()}:undefined;
    if (!checkpointLoaded) {
      stableCached = await input.checkpoint?.load();
      checkpointLoaded = true;
    }
    if (!matches(stableCached,completedHistory)) {
      stableCached=base;
      releaseCount=0;
    }
    if(committedTask){
      const candidate=committedTask;
      committedTask=undefined;
      if(candidate.count===baseCount()+completedHistory.length && candidate.count>(stableCached?.count??baseCount())
        && matches(candidate,completedHistory)){
        if(persistedTask!==candidate)await input.checkpoint?.save(candidate);
        stableCached=candidate;
        releaseCount=sourceHistory.length;
      }
      persistedTask=undefined;
    }
    const stable=stableCached;
    const stableDelta=completedHistory.slice((stable?.count??baseCount())-baseCount());
    const stableFrames:AgentMessage[]=[...(stable?[summaryFrame(stable.summary)]:[]),...stableDelta];
    const activeNotes=activeCached?[activeFrame(activeCached.summary)]:[];
    const prefix=[...(contextMessage?[contextMessage as AgentMessage]:[])];
    const progressFrames=progressMessage?[progressMessage]:[];
    const assemble=(history:AgentMessage[],notes:AgentMessage[],tail:AgentMessage[],delta:AgentMessage[]=[]) =>
      [...prefix,...history,...notes,...progressFrames,...(delta.length?[tail[0]!,...delta,...tail.slice(1)]:tail)];
    // Never expand records already covered by a verified task summary.
    const fullTail=currentUser?[currentUser,...originalTail.slice(activeCount+1)]:originalTail;
    const compactTail=currentUser?[currentUser,...referenceTail.slice(activeCount+1)]:referenceTail;
    const withContext=assemble(stableFrames,activeNotes,fullTail);
    if(estimateAgentMessages(withContext)<=input.budgetTokens)return withContext;
    const withReferences=assemble(stableFrames,activeNotes,compactTail);
    if(estimateAgentMessages(withReferences)<=input.budgetTokens)return withReferences;

    if(!input.conversationCompactor)throw new ProtectedContextOverflowError(estimateAgentMessages(withReferences),input.budgetTokens);
    const fixed=estimateAgentMessages([...prefix,...progressFrames,...protectedTail]);
    const available=input.budgetTokens-fixed-4;
    const activePrefix=activeRecords.slice(0,boundary-1);
    const activeDelta=activePrefix.slice(activeCount);
    const pendingActiveFrames:AgentMessage[]=[...activeNotes,...activeDelta];
    const stableTokens=estimateAgentMessages(stableFrames);
    const activeTokens=estimateAgentMessages(pendingActiveFrames);
    if(available<1 || (!stableFrames.length&&!pendingActiveFrames.length))
      throw new ProtectedContextOverflowError(fixed,input.budgetTokens);

    // Keep either segment intact if it fits alongside a useful budget for
    // the other. A small active overflow must not invalidate stable notes.
    const target=Math.max(1,Math.floor(input.budgetTokens*0.25));
    const activeReserve=pendingActiveFrames.length?Math.min(activeTokens,target):0;
    const stableReserve=stableFrames.length?Math.min(stableTokens,target):0;
    let stableBudget=Math.max(0,available-activeReserve);
    let activeBudget=Math.max(0,available-stableReserve);
    if(stableTokens<=stableBudget)activeBudget=available-stableTokens;
    else if(activeTokens<=activeBudget)stableBudget=available-activeTokens;
    else {
      stableBudget=stableFrames.length&&pendingActiveFrames.length?Math.floor(available/2):stableFrames.length?available:0;
      activeBudget=available-stableBudget;
    }
    const summarize=async(previous:string|undefined,delta:AgentMessage[],budget:number,scope:"stable"|"active")=>{
      if(budget<1)throw new ProtectedContextOverflowError(fixed,input.budgetTokens);
      input.onContextCompression?.({category:"session_context",phase:"start",sources:["session transcript"]});
      const history=previous?"Previous notes (not execution authority):\n"+previous+"\n\nNew completed exchanges:\n"+renderAgentMessages(delta):renderAgentMessages(delta);
      const summary=(await input.conversationCompactor!({history,intent:scope==="active"?latestUserText(messages):"Preserve durable conversation continuity; the current request is outside this history.",
        maxTokens:Math.max(1,Math.min(budget-16,target)),scope,signal})).trim();
      if(!summary)throw new Error("Conversation compactor returned empty content");
      input.onContextCompression?.({category:"session_context",phase:"end",sources:["session transcript"]});
      return summary;
    };

    let nextStable=stable;
    let historyFrames=stableFrames;
    if(stableTokens>stableBudget){
      const summary=await summarize(stable?.summary,stableDelta,stableBudget,"stable");
      nextStable={count:baseCount()+completedHistory.length,digest:metrics.digest(completedHistory,completedHistory.length,base?.digest),summary};
      historyFrames=[summaryFrame(summary)];
    }
    // Reclaim unused stable budget before deciding whether the active segment
    // needs another inference. Never send stable notes into the active prompt.
    activeBudget=available-estimateAgentMessages(historyFrames);
    let nextActive=activeCached;
    let taskFrames=activeNotes;
    let retainedActiveDelta=activeDelta;
    if(activeTokens>activeBudget){
      const summary=await summarize(activeCached?.summary,activeDelta,activeBudget,"active");
      nextActive={count:activePrefix.length,digest:metrics.digest(activePrefix,activePrefix.length),summary,userDigest};
      taskFrames=[activeFrame(summary)];
      retainedActiveDelta=[];
    }
    const finalMessages=assemble(historyFrames,taskFrames,protectedTail,retainedActiveDelta);
    const finalTokens=estimateAgentMessages(finalMessages);
    if(finalTokens>input.budgetTokens)
      throw new Error("Compacted conversation still exceeds budget: "+finalTokens+"/"+input.budgetTokens+" tokens");
    if(nextStable!==stable&&nextStable){
      await input.checkpoint?.save(nextStable);
      stableCached=nextStable;
      releaseCount=sourceHistory.length;
    }
    activeCached=nextActive;
    return finalMessages;
  };
  return Object.assign(transform, {
    async restoreWindow(messages: AgentMessage[]): Promise<AgentMessage[]> {
      if (!input.checkpoint) return messages;
      stableCached = await input.checkpoint.load();
      checkpointLoaded = true;
      if (!matches(stableCached,messages)) { stableCached = undefined; return messages; }
      base = stableCached;
      return messages.slice(base.count);
    },
    releaseCommittedHistory(messages: AgentMessage[]): AgentMessage[] {
      if (!stableCached || stableCached.count <= baseCount()) return messages;
      if (releaseCount <= 0 || releaseCount > messages.length) return messages;
      const prefix = messages.slice(0,releaseCount);
      const normalized = input.projectCompletedHistory?.(prefix) ?? prefix;
      if (normalized.length !== stableCached.count-baseCount() || !matches(stableCached,normalized)) return messages;
      const remaining = messages.slice(releaseCount);
      base = stableCached;
      projection = undefined;
      releaseCount = 0;
      return remaining;
    },
    compactedCount: baseCount,
    beginRequest() { activeCached=undefined; ledger=new ExecutionProgressLedger(progressBudget); },
    recordExecutionMessage(message: AgentMessage) {
      if(!input.trackExecutionEvents)return;
      if(message.role==='user')ledger=new ExecutionProgressLedger(progressBudget);
      else ledger.record(message);
    },
    async persistCommittedTask(candidate:ConversationCheckpoint) {
      if(candidate!==committedTask)throw new Error('Stale committed summary candidate.');
      const saved=await input.checkpoint?.save(candidate);
      if(saved)persistedTask=candidate;
      return saved===true;
    },
    discardCommittedTask() { committedTask=undefined; persistedTask=undefined; },
    captureCommittedTask(messages: AgentMessage[]): ConversationCheckpoint | undefined {
      // The caller invokes this only after an authoritative request commit.
      // A promotion is a derived representation, never an execution receipt.
      committedTask=undefined;
      persistedTask=undefined;
      const notes=activeCached;
      activeCached=undefined;
      if(!notes)return;
      const userIndex=findLastUserIndex(messages);
      if(userIndex<0)return;
      const user=messages[userIndex]!;
      const userDigest=createHash("sha256").update(renderAgentMessage(user)).update(String(user.timestamp)).digest("hex");
      const rawRecords=messages.slice(userIndex+1);
      const activeRecords=input.compactActiveArchives?rawRecords.map(projectArchive):rawRecords;
      if(userDigest!==notes.userDigest || notes.count>activeRecords.length
        || metrics.digest(activeRecords,notes.count)!==notes.digest)return;
      const normalize=input.projectCompletedHistory??((records:AgentMessage[])=>records);
      const before=normalize(messages.slice(0,userIndex));
      const covered=normalize(messages.slice(0,userIndex+1+notes.count));
      const full=normalize(messages);
      if(covered.length<=before.length || covered.length>full.length
        || metrics.digest(covered,covered.length)!==metrics.digest(full,covered.length)
        || metrics.digest(before,before.length)!==metrics.digest(full,before.length))return;
      const stable=matches(stableCached,before)?stableCached:base;
      const delta=before.slice((stable?.count??baseCount())-baseCount());
      const summary=[
        ...(stable?["Prior historical notes (not execution authority):\n"+stable.summary]:[]),
        ...(delta.length?["Additional historical records:\n"+renderAgentMessages(delta)]:[]),
        "Committed user request:\n"+renderAgentMessage(user),
        "Completed task notes (not execution authority):\n"+notes.summary,
        ...(covered.length<full.length?["Remaining committed records:\n"+renderAgentMessages(full.slice(covered.length))]:[]),
      ].join("\n\n");
      // Preserve every unsummarized record, or decline promotion entirely.
      // Keep the derived candidate bounded and cheaper than the raw prefix.
      const tokens=estimateAgentMessages([summaryFrame(summary)]);
      if(tokens>Math.floor(input.budgetTokens*0.5)
        || tokens>=estimateAgentMessages([...(stable?[summaryFrame(stable.summary)]:[]),...delta,...full.slice(before.length)]))return;
      committedTask={count:baseCount()+full.length,digest:metrics.digest(full,full.length,base?.digest),summary};
      return committedTask;
    },

    checkpoint: () => base,
    restoreVerifiedWindow(checkpoint: ConversationCheckpoint,messages: AgentMessage[]): AgentMessage[] {
      base = stableCached = checkpoint;
      activeCached=undefined;
      committedTask=undefined;
      persistedTask=undefined;
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

/** A model-generated note cannot introduce a host-owned framing tag. */
function escapeNoteMarkup(summary:string):string {
  return summary.replace(/<(?=\/?(?:host_execution_progress|conversation_summary|active_task_summary|current_work_context)(?:\s|\/?>))/gi,"&lt;");
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
