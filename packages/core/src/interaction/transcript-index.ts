import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";

export function transcriptIndexPath(root: string, sessionId: string, kind: "sequence" | "window"): string {
  return join(root, ".inkos", "transcript-index", createHash("sha256").update(sessionId).digest("hex") + "." + kind + ".json");
}

export async function loadTranscriptIndex<T>(path: string, schema: z.ZodType<T>): Promise<T | undefined> {
  let file;
  try { file = await open(path, "r"); }
  catch (error) {
    const code=(error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return undefined;
    if (code === "EACCES" || code === "EPERM") {
      process.emitWarning("Cannot read derived transcript index: "+String(error));
      return undefined;
    }
    throw error;
  }
  try {
    const buffer = Buffer.alloc(4097);
    let offset = 0;
    while (offset < buffer.length) {
      const {bytesRead} = await file.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > 4096) return undefined;
    let raw: unknown;
    try { raw = JSON.parse(buffer.subarray(0,offset).toString("utf8")); }
    catch (error) { if (error instanceof SyntaxError) return undefined; throw error; }
    const result = schema.safeParse(raw);
    return result.success ? result.data : undefined;
  } finally { await file.close(); }
}

/** Derived index failure cannot undo an authoritative JSONL append. */
export async function saveTranscriptIndex(path: string, value: unknown): Promise<void> {
  const bytes = JSON.stringify(value);
  if (Buffer.byteLength(bytes) > 4096) return;
  const tmp = path + "." + randomUUID() + ".tmp";
  try {
    await mkdir(dirname(path), {recursive:true});
    await writeFile(tmp, bytes, {encoding:"utf8",flag:"wx"});
    await rename(tmp,path);
  } catch (error) {
    process.emitWarning("Cannot save derived transcript index: " + String(error));
  } finally {
    try { await rm(tmp,{force:true}); }
    catch (error) { process.emitWarning("Cannot remove temporary transcript index: " + String(error)); }
  }
}

export const sequenceIndexSchema = z.object({
  version: z.literal(1),
  fingerprint: z.string(),
  state: z.object({nextSeq:z.number().int().safe().positive(),lastCommittedSeq:z.number().int().safe().nonnegative(),hasSessionCreated:z.boolean()})
    .refine(state=>state.lastCommittedSeq<state.nextSeq),
});

export async function removeTranscriptIndexes(root: string, sessionId: string): Promise<void> {
  await Promise.all((["sequence","window"] as const).map(kind=>rm(transcriptIndexPath(root,sessionId,kind),{force:true})));
}
