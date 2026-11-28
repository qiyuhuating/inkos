import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { z } from "zod";
import { digestConversationMessages } from "../harness/agent-context.js";
import type { ConversationCheckpoint } from "../harness/conversation-checkpoint.js";
import { transcriptPath, type TranscriptRevision } from "./session-transcript.js";
import type { SessionKind, TranscriptEvent } from "./session-transcript-schema.js";
import { adaptRestoredAgentMessagesForModel, restoreAgentMessagesFromEvents } from "./session-transcript-restore.js";
import { loadTranscriptIndex, saveTranscriptIndex, transcriptIndexPath } from "./transcript-index.js";
import { streamTranscriptEntries, transcriptFileIdentity, verifyTranscriptBoundary } from "./transcript-reader.js";

const schema = z.object({
  version: z.literal(1),
  fingerprint: z.string(),
  identity: z.string(),
  count: z.number().int().safe().positive(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  byteOffset: z.number().int().safe().positive(),
  seq: z.number().int().safe().nonnegative(),
});
export type RecoveryIndex = z.infer<typeof schema>;
type Target = Parameters<typeof adaptRestoredAgentMessagesForModel>[1];
interface RecoveryOptions {
  root: string;
  sessionId: string;
  sessionKind: SessionKind;
  identity: string;
  model: Target;
  canReadArchives: boolean;
  revision: TranscriptRevision;
  checkpoint: ConversationCheckpoint;
}

function matches(index: RecoveryIndex | undefined, options: RecoveryOptions): index is RecoveryIndex {
  return Boolean(index && index.fingerprint === options.revision.fingerprint
    && index.identity === options.identity && index.count === options.checkpoint.count
    && index.digest === options.checkpoint.digest && index.byteOffset <= options.revision.byteLength
    && index.seq <= options.revision.lastCommittedSeq);
}

/** Normal host requests are self-contained. Legacy cross-request tool calls,
 * interleaved requests and trailing-thinking ambiguities use canonical restore. */
function projectRequest(events: TranscriptEvent[], options: RecoveryOptions): AgentMessage[] | undefined {
  const started = events[0];
  if (started?.type !== "request_started") return undefined;
  if (started.sessionKind && started.sessionKind !== options.sessionKind) return [];
  const raw = events.filter(event=>event.type==="message");
  const cleaned = restoreAgentMessagesFromEvents(events,options.sessionKind);
  if (!cleaned.length) return raw.length ? undefined : [];
  if (cleaned[0]?.role !== "user") return undefined;
  // A result dropped by request-local cleaning could have a call in an older
  // request. Do not certify a prefix with a different interpretation.
  if (raw.filter(event=>event.role==="toolResult").length !== cleaned.filter(message=>message.role==="toolResult").length)
    return undefined;
  const last = raw.filter(event=>{
    const message=event.message as {content?:unknown};
    return event.role !== "assistant" || (Array.isArray(message?.content) && message.content.some(part=>
      part?.type==="text" && part.text?.length>0 || part?.type==="toolCall"));
  }).at(-1);
  if (last?.role==="assistant") {
    const content=(last.message as {content?:{type?:string}[]}).content;
    if (["thinking","redacted_thinking"].includes(content?.at(-1)?.type ?? "")) return undefined;
  }
  return adaptRestoredAgentMessagesForModel(cleaned,options.model,options.canReadArchives);
}

interface ScannedWindow {
  index: RecoveryIndex;
  messages: AgentMessage[];
  scannedBytes: number;
  usedIndex: boolean;
}

async function scan(options: RecoveryOptions, anchor: RecoveryIndex | undefined, collectTail: boolean): Promise<ScannedWindow | undefined> {
  const {revision,checkpoint}=options;
  if (!revision.fingerprint) return undefined;
  const path=transcriptPath(options.root,options.sessionId);
  if ((await transcriptFileIdentity(path))?.fingerprint !== revision.fingerprint) throw new Error("Transcript changed before recovery.");
  if (anchor && !await verifyTranscriptBoundary(path,anchor.byteOffset,options.sessionId,anchor.seq)) anchor=undefined;
  const start=anchor?.byteOffset ?? 0;
  let count=anchor?.count ?? 0;
  let digest=anchor?.digest;
  let lastSeq=anchor?.seq ?? -1;
  let boundary=count===checkpoint.count && digest===checkpoint.digest ? {byteOffset:start,seq:lastSeq} : undefined;
  const messages:AgentMessage[]=[];
  let request:TranscriptEvent[]=[];
  let requestId:string|undefined;
  const seenRequests=new Set<string>();
  let scannedEnd=start;
  if (!boundary || collectTail) {
    for await (const {event,end} of streamTranscriptEntries(path,start,revision.byteLength)) {
      scannedEnd=end;
      if (event.sessionId!==options.sessionId || event.seq<=lastSeq) return undefined;
      lastSeq=event.seq;
      if (event.type==="request_started") {
        if (requestId!==undefined || seenRequests.has(event.requestId)) return undefined;
        seenRequests.add(event.requestId);
        requestId=event.requestId;
        request=[event];
      } else if (event.type==="message") {
        if (requestId!==event.requestId) return undefined;
        request.push(event);
      } else if (event.type==="request_committed" || event.type==="request_failed") {
        if (requestId!==event.requestId) return undefined;
        request.push(event);
        if (event.type==="request_committed") {
          const projected=projectRequest(request,options);
          if (!projected) return undefined;
          if (boundary) for (const message of projected) messages.push(message);
          else {
            count+=projected.length;
            digest=digestConversationMessages(projected,digest);
            if (count>checkpoint.count) return undefined;
            if (count===checkpoint.count) {
              if (digest!==checkpoint.digest) return undefined;
              boundary={byteOffset:end,seq:event.seq};
            }
          }
        }
        request=[];
        requestId=undefined;
        if (boundary && !collectTail) break;
      }
    }
  }
  if ((await transcriptFileIdentity(path))?.fingerprint!==revision.fingerprint) throw new Error("Transcript changed during recovery.");
  if (!boundary) return undefined;
  return {index:{version:1,fingerprint:revision.fingerprint,identity:options.identity,
    count:checkpoint.count,digest:checkpoint.digest,...boundary},messages,
    scannedBytes:scannedEnd-start,usedIndex:Boolean(anchor)};
}

/** An exact file revision can seek past the already-certified prefix. A missing
 * or stale index streams requests and rebuilds the prefix without retaining it. */
export async function restoreIndexedConversation(options: RecoveryOptions): Promise<ScannedWindow | undefined> {
  const path=transcriptIndexPath(options.root,options.sessionId,"window");
  const existing=await loadTranscriptIndex(path,schema);
  const result=await scan(options,matches(existing,options)?existing:undefined,true);
  if (result && !result.usedIndex) await saveTranscriptIndex(path,result.index);
  return result;
}

/** Only reuse an older offset if the sequence cache observed the entire append
 * chain. Otherwise revalidate from byte zero rather than assuming append-only. */
export async function advanceConversationIndex(options: RecoveryOptions, previous?: RecoveryIndex, before?: TranscriptRevision): Promise<RecoveryIndex | undefined> {
  const anchor=previous && before && previous.fingerprint===before.fingerprint
    && before.generation===options.revision.generation && previous.identity===options.identity
    && previous.count<=options.checkpoint.count && previous.byteOffset<=before.byteLength
    ? previous:undefined;
  const result=await scan(options,anchor,false);
  if (!result) return undefined;
  await saveTranscriptIndex(transcriptIndexPath(options.root,options.sessionId,"window"),result.index);
  return result.index;
}
