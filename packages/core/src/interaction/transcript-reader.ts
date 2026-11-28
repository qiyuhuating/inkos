import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { TranscriptEventSchema, type TranscriptEvent } from "./session-transcript-schema.js";

export async function transcriptFileIdentity(path: string) {
  try {
    const info = await stat(path, { bigint: true });
    return { file: [info.dev, info.ino].join(":"), size: info.size,
      fingerprint: [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].join(":") };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Verify the small terminal record just before an indexed offset. */
export async function verifyTranscriptBoundary(path: string, offset: number, sessionId: string, seq: number): Promise<boolean> {
  if (!Number.isSafeInteger(offset) || offset < 1) return false;
  const start=Math.max(0,offset-4096);
  const file=await open(path,"r");
  try {
    const bytes=Buffer.alloc(offset-start);
    let read=0;
    while(read<bytes.length){
      const result=await file.read(bytes,read,bytes.length-read,start+read);
      if(!result.bytesRead)return false;
      read+=result.bytesRead;
    }
    if(bytes.at(-1)!==10)return false;
    const previous=bytes.lastIndexOf(10,bytes.length-2);
    if(previous<0&&start!==0)return false;
    let value: unknown;
    try { value=JSON.parse(bytes.subarray(previous+1,bytes.length-1).toString("utf8")); }
    catch(error){if(error instanceof SyntaxError)return false;throw error;}
    const parsed=TranscriptEventSchema.safeParse(value);
    return parsed.success&&parsed.data.type==="request_committed"&&parsed.data.seq===seq&&parsed.data.sessionId===sessionId;
  } finally { await file.close(); }
}

export interface TranscriptEntry {
  readonly event: TranscriptEvent;
  readonly end: number;
}

function parseLine(path: string, bytes: Buffer, end: number): TranscriptEntry | undefined {
  const text = bytes.toString("utf8");
  if (!text.trim()) return undefined;
  try {
    return { event: TranscriptEventSchema.parse(JSON.parse(text)), end };
  } catch (error) {
    throw new Error("Invalid transcript event at " + path + " (byte " + end + "): " + String(error));
  }
}

/** Stream complete UTF-8 records; at most one line plus the input chunk is held. */
export async function* streamTranscriptEntries(path: string, start: number, end: number): AsyncGenerator<TranscriptEntry> {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start)
    throw new Error("Invalid transcript byte range.");
  if (start === end) return;
  if (start > 0) {
    const file = await open(path, "r");
    try {
      const byte = Buffer.alloc(1);
      const result = await file.read(byte, 0, 1, start - 1);
      if (result.bytesRead !== 1 || byte[0] !== 10) throw new Error("Transcript offset is not a record boundary.");
    } finally { await file.close(); }
  }
  const stream = createReadStream(path, { start, end: end - 1, highWaterMark: 64 * 1024 });
  let offset = start;
  let pieces: Buffer[] = [];
  for await (const chunk of stream) {
    if (!Buffer.isBuffer(chunk)) throw new Error("Expected binary transcript data.");
    let from = 0;
    for (;;) {
      const newline = chunk.indexOf(10, from);
      if (newline < 0) break;
      const piece = chunk.subarray(from, newline);
      const line = pieces.length ? Buffer.concat([...pieces, piece]) : piece;
      pieces = [];
      offset += newline - from + 1;
      const parsed = parseLine(path, line, offset);
      if (parsed) yield parsed;
      from = newline + 1;
    }
    if (from < chunk.length) {
      const piece = chunk.subarray(from);
      pieces.push(piece);
      offset += piece.length;
    }
  }
  if (offset !== end) throw new Error("Transcript changed during streaming read.");
  if (pieces.length) {
    const parsed = parseLine(path, Buffer.concat(pieces), offset);
    if (parsed) yield parsed;
  }
}
