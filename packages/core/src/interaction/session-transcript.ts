import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { TranscriptEventSchema, type TranscriptEvent } from "./session-transcript-schema.js";
import type { SessionKind, TranscriptRole } from "./session-transcript-schema.js";
import { streamTranscriptEntries, transcriptFileIdentity } from "./transcript-reader.js";
import { loadTranscriptIndex, saveTranscriptIndex, sequenceIndexSchema, transcriptIndexPath } from "./transcript-index.js";

const SESSIONS_DIR = ".inkos/sessions";
const appendQueues = new Map<string, Promise<void>>();

/** Recover the request that produced this confirmation, even after other chat turns. */
export function confirmedRequestInstruction(
  events: ReadonlyArray<TranscriptEvent>, action: string, instruction: string,
): string {
  for (const event of [...events].reverse()) {
    if (event.type !== "message" || event.role !== "toolResult") continue;
    const details = (event.message as { details?: Record<string, unknown> }).details;
    if (details?.kind !== "proposed_action" || details.action !== action || details.instruction !== instruction) continue;
    const request = events.find(candidate => candidate.type === "request_started" && candidate.requestId === event.requestId);
    if (request?.type === "request_started" && request.input.trim()) return request.input;
  }
  return instruction;
}

export function sessionsDir(projectRoot: string): string {
  return join(projectRoot, SESSIONS_DIR);
}

export function transcriptPath(projectRoot: string, sessionId: string): string {
  return join(sessionsDir(projectRoot), `${sessionId}.jsonl`);
}

export async function readTranscriptEvents(
  projectRoot: string,
  sessionId: string,
): Promise<TranscriptEvent[]> {
  let raw: string;
  try {
    raw = await readFile(transcriptPath(projectRoot, sessionId), "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const events: TranscriptEvent[] = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      events.push(TranscriptEventSchema.parse(JSON.parse(line)));
    } catch (error) {
      throw new Error(`Invalid transcript event at ${transcriptPath(projectRoot, sessionId)}:${index + 1}: ${String(error)}`);
    }
  }

  return events.sort((a, b) => a.seq - b.seq);
}

interface TranscriptSequence {
  readonly nextSeq: number;
  readonly lastCommittedSeq: number;
  readonly hasSessionCreated: boolean;
}

const sequenceCache = new Map<string, { fingerprint: string; state: TranscriptSequence; generation: string }>();
const MAX_SEQUENCE_CACHE = 128;



function advanceSequence(state: TranscriptSequence, events: readonly TranscriptEvent[]): TranscriptSequence {
  let { nextSeq, lastCommittedSeq, hasSessionCreated } = state;
  for (const event of events) {
    nextSeq = Math.max(nextSeq, event.seq + 1);
    if (event.type === "request_committed") lastCommittedSeq = Math.max(lastCommittedSeq, event.seq);
    if (event.type === "session_created") hasSessionCreated = true;
  }
  return { nextSeq, lastCommittedSeq, hasSessionCreated };
}

function retainSequence(path: string, fingerprint: string, state: TranscriptSequence, generation: string): void {
  sequenceCache.delete(path);
  sequenceCache.set(path, { fingerprint, state, generation });
  if (sequenceCache.size > MAX_SEQUENCE_CACHE) sequenceCache.delete(sequenceCache.keys().next().value!);
}

async function loadSequence(projectRoot: string, sessionId: string, includeEvents: boolean) {
  const path = resolve(transcriptPath(projectRoot, sessionId));
  const before = await transcriptFileIdentity(path);
  const cached = sequenceCache.get(path);
  if (!includeEvents && before && cached?.fingerprint === before.fingerprint) {
    retainSequence(path, before.fingerprint, cached.state, cached.generation);
    return { path, identity: before, state: cached.state, generation: cached.generation, events: [] as TranscriptEvent[] };
  }
  const generation = before && cached?.fingerprint === before.fingerprint ? cached.generation : randomUUID();
  sequenceCache.delete(path);
  const events = includeEvents ? await readTranscriptEvents(projectRoot, sessionId) : [];
  let state = advanceSequence({ nextSeq: 1, lastCommittedSeq: 0, hasSessionCreated: false }, events);
  if (!includeEvents && before) {
    const index = await loadTranscriptIndex(transcriptIndexPath(projectRoot,sessionId,"sequence"),sequenceIndexSchema);
    if (index?.fingerprint === before.fingerprint) state = index.state;
    else for await (const entry of streamTranscriptEntries(path,0,Number(before.size))) state = advanceSequence(state,[entry.event]);
  }
  const after = await transcriptFileIdentity(path);
  // Cache only a stable read. An external replacement must be revalidated.
  if (before?.fingerprint !== after?.fingerprint) throw new Error("Transcript changed during read; retry the operation.");
  const identity = after;
  if (identity) retainSequence(path, identity.fingerprint, state, generation);
  return { path, identity, state, generation, events };
}

export async function readTranscriptSequence(projectRoot: string, sessionId: string): Promise<TranscriptSequence> {
  return (await loadSequence(projectRoot, sessionId, false)).state;
}

export interface TranscriptRevision {
  readonly lastCommittedSeq: number;
  readonly fingerprint?: string;
  readonly byteLength: number;
  readonly generation: string;
}

export async function readTranscriptRevision(projectRoot: string, sessionId: string): Promise<TranscriptRevision> {
  const loaded = await loadSequence(projectRoot, sessionId, false);
  return { lastCommittedSeq: loaded.state.lastCommittedSeq, fingerprint: loaded.identity?.fingerprint,
    byteLength:Number(loaded.identity?.size ?? 0n), generation:loaded.generation };
}

export interface TranscriptPageCursor { readonly fingerprint: string; readonly byteOffset: number }

/** Seek directly to a validated byte boundary. A rewritten log invalidates its cursors. */
export async function readTranscriptPage(projectRoot: string, sessionId: string, cursor?: TranscriptPageCursor, limit=128) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 512) throw new Error("Invalid transcript page size.");
  const path = transcriptPath(projectRoot,sessionId);
  const before = await transcriptFileIdentity(path);
  if (cursor && cursor.fingerprint !== before?.fingerprint) throw new Error("Transcript page cursor is stale.");
  if (!before) return {events:[] as TranscriptEvent[],nextCursor:null};
  const events: TranscriptEvent[] = [];
  let offset = cursor?.byteOffset ?? 0;
  let nextCursor: TranscriptPageCursor | null = null;
  for await (const entry of streamTranscriptEntries(path,offset,Number(before.size))) {
    if (events.length === limit) { nextCursor={fingerprint:before.fingerprint,byteOffset:offset}; break; }
    events.push(entry.event); offset=entry.end;
  }
  if ((await transcriptFileIdentity(path))?.fingerprint !== before.fingerprint) throw new Error("Transcript changed during page read.");
  return {events,nextCursor};
}

export async function nextTranscriptSeq(projectRoot: string, sessionId: string): Promise<number> {
  return (await readTranscriptSequence(projectRoot, sessionId)).nextSeq;
}

export async function appendTranscriptEvent(
  projectRoot: string,
  event: TranscriptEvent,
): Promise<void> {
  await appendTranscriptSequenceEvents(projectRoot, event.sessionId, () => [event]);
}

type TranscriptBuilder<T> = (context: T) => ReadonlyArray<TranscriptEvent> | Promise<ReadonlyArray<TranscriptEvent>>;

async function appendQueued(
  projectRoot: string,
  sessionId: string,
  includeEvents: boolean,
  buildEvents: TranscriptBuilder<TranscriptSequence & { readonly events: ReadonlyArray<TranscriptEvent> }>,
): Promise<TranscriptEvent[]> {
  const key = resolve(transcriptPath(projectRoot, sessionId));
  const previous = appendQueues.get(key) ?? Promise.resolve();
  let result: TranscriptEvent[] = [];
  const next = previous.then(async () => {
    const loaded = await loadSequence(projectRoot, sessionId, includeEvents);
    const built = await buildEvents({ ...loaded.state, events: loaded.events });
    result = built.map(event => TranscriptEventSchema.parse(event));
    if (!result.length) return;
    const payload = result.map(event => JSON.stringify(event)).join("\n") + "\n";
    await mkdir(sessionsDir(projectRoot), { recursive: true });
    const before = await transcriptFileIdentity(key);
    sequenceCache.delete(key);
    if (before?.fingerprint !== loaded.identity?.fingerprint) throw new Error("Transcript changed before append; retry the operation.");
    await appendFile(key, payload, "utf-8");
    const after = await transcriptFileIdentity(key);
    if (after && before?.fingerprint === loaded.identity?.fingerprint
      && (!before || before.file === after.file)
      && after.size === (before?.size ?? 0n) + BigInt(Buffer.byteLength(payload))) {
      const state = advanceSequence(loaded.state, result);
      retainSequence(key, after.fingerprint, state, loaded.generation);
      if (result.some(event=>event.type === "request_committed" || event.type === "request_failed" || event.type === "session_metadata_updated")) {
        await saveTranscriptIndex(transcriptIndexPath(projectRoot,sessionId,"sequence"),{version:1,fingerprint:after.fingerprint,state});
      }
    }
  });
  const settled = next.catch(() => undefined);
  appendQueues.set(key, settled);
  try {
    await next;
    return result;
  } finally {
    if (appendQueues.get(key) === settled) appendQueues.delete(key);
  }
}

/** Existing full-history contract, for mutations whose authorization depends on earlier events. */
export function appendTranscriptEvents(
  projectRoot: string,
  sessionId: string,
  buildEvents: TranscriptBuilder<{ readonly events: ReadonlyArray<TranscriptEvent>; readonly nextSeq: number }>,
): Promise<TranscriptEvent[]> {
  return appendQueued(projectRoot, sessionId, true, buildEvents);
}

/** Sequence-only hot path; never retains historical message or tool payloads. */
export function appendTranscriptSequenceEvents(
  projectRoot: string,
  sessionId: string,
  buildEvents: TranscriptBuilder<TranscriptSequence>,
): Promise<TranscriptEvent[]> {
  return appendQueued(projectRoot, sessionId, false, buildEvents);
}

function transcriptRoleForMessage(message: AgentMessage): TranscriptRole | null {
  if (!message || typeof message !== "object" || !("role" in message)) return null;
  const role = (message as { role?: unknown }).role;
  return role === "user" || role === "assistant" || role === "toolResult" || role === "system"
    ? role
    : null;
}

function messageTimestamp(message: AgentMessage): number {
  if (message && typeof message === "object") {
    const timestamp = (message as { timestamp?: unknown }).timestamp;
    if (typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp >= 0) {
      return Math.floor(timestamp);
    }
  }
  return Date.now();
}

function toolCallIdForMessage(message: AgentMessage): string | undefined {
  if (!message || typeof message !== "object") return undefined;
  if ((message as { role?: unknown }).role === "toolResult") {
    const toolCallId = (message as { toolCallId?: unknown }).toolCallId;
    return typeof toolCallId === "string" && toolCallId.length > 0 ? toolCallId : undefined;
  }

  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return undefined;
  const block = content.find(
    (item): item is { type: "toolCall"; id: string } =>
      !!item &&
      typeof item === "object" &&
      (item as { type?: unknown }).type === "toolCall" &&
      typeof (item as { id?: unknown }).id === "string",
  );
  return block?.id;
}

export async function appendManualSessionMessages(
  projectRoot: string,
  sessionId: string,
  messages: ReadonlyArray<AgentMessage>,
  input = "",
  options: {
    readonly sessionKind?: SessionKind;
    readonly display?: {
      readonly thinking?: string;
      readonly toolExecutions?: readonly unknown[];
    };
  } = {},
): Promise<void> {
  const persistedMessages = messages
    .map((message) => ({ message, role: transcriptRoleForMessage(message) }))
    .filter((entry): entry is { message: AgentMessage; role: TranscriptRole } => entry.role !== null);
  if (persistedMessages.length === 0) return;

  const requestId = randomUUID();
  await appendTranscriptSequenceEvents(projectRoot, sessionId, ({ nextSeq }) => {
    let seq = nextSeq;
    const events: TranscriptEvent[] = [{
      type: "request_started",
      version: 1,
      sessionId,
      requestId,
      seq: seq++,
      timestamp: Date.now(),
      ...(options.sessionKind ? { sessionKind: options.sessionKind } : {}),
      input,
    }];

    let parentUuid: string | null = null;
    let lastAssistantUuid: string | null = null;
    for (const { message, role } of persistedMessages) {
      const uuid = randomUUID();
      const isToolResult = role === "toolResult";
      const toolCallId = toolCallIdForMessage(message);
      const display = role === "assistant" && options.display
        ? {
            ...(options.display.thinking ? { thinking: options.display.thinking } : {}),
            ...(options.display.toolExecutions?.length
              ? { toolExecutions: [...options.display.toolExecutions] }
              : {}),
          }
        : undefined;
      events.push({
        type: "message",
        version: 1,
        sessionId,
        requestId,
        uuid,
        parentUuid: isToolResult && lastAssistantUuid ? lastAssistantUuid : parentUuid,
        seq: seq++,
        role,
        timestamp: messageTimestamp(message),
        ...(toolCallId ? { toolCallId } : {}),
        ...(isToolResult && lastAssistantUuid
          ? { sourceToolAssistantUuid: lastAssistantUuid }
          : {}),
        ...(display && (display.thinking || display.toolExecutions?.length)
          ? { display }
          : {}),
        message,
      });
      if (role === "assistant") lastAssistantUuid = uuid;
      parentUuid = uuid;
    }

    events.push({
      type: "request_committed",
      version: 1,
      sessionId,
      requestId,
      seq,
      timestamp: Date.now(),
    });
    return events;
  });
}
