import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";

const schema = z.object({
  version: z.literal(1),
  identity: z.string(),
  count: z.number().int().positive(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  summary: z.string().min(1),
});
export type ConversationCheckpoint = Pick<z.infer<typeof schema>, "count" | "digest" | "summary">;
const MAX_BYTES = 128 * 1024;

function checkpointPath(root: string, sessionId: string): string {
  return join(root, ".inkos", "conversation-checkpoints", createHash("sha256").update(sessionId).digest("hex") + ".json");
}

/** Derived cache only; the transcript remains authoritative. */
export class ConversationCheckpointStore {
  private readonly path: string;
  private readonly identity: string;
  constructor(root: string, sessionId: string, identity: string) {
    this.path = checkpointPath(root, sessionId);
    this.identity = identity;
  }
  async load(): Promise<ConversationCheckpoint | undefined> {
    const file = await open(this.path, "r").catch(error => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    });
    if (!file) return undefined;
    try {
      const buffer = Buffer.alloc(MAX_BYTES + 1);
      let offset = 0;
      while (offset < buffer.length) {
        const result = await file.read(buffer, offset, buffer.length - offset, offset);
        if (!result.bytesRead) break;
        offset += result.bytesRead;
      }
      if (offset > MAX_BYTES) return undefined;
      let raw: unknown;
      try { raw = JSON.parse(buffer.subarray(0, offset).toString("utf8")); }
      catch (error) {
        if (error instanceof SyntaxError) return undefined;
        throw error;
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success || parsed.data.identity !== this.identity) return undefined;
      const {count,digest,summary} = parsed.data;
      return {count,digest,summary};
    } finally { await file.close(); }
  }
  async save(checkpoint: ConversationCheckpoint): Promise<void> {
    const bytes = JSON.stringify({version:1,identity:this.identity,...checkpoint});
    if (Buffer.byteLength(bytes) > MAX_BYTES) return;
    await mkdir(dirname(this.path), {recursive:true});
    const tmp = this.path + "." + randomUUID() + ".tmp";
    try {
      await writeFile(tmp, bytes, {encoding:"utf8",flag:"wx"});
      await rename(tmp,this.path);
    } finally { await rm(tmp,{force:true}); }
  }
}

export async function removeConversationCheckpoint(root: string, sessionId: string): Promise<void> {
  await rm(checkpointPath(root,sessionId),{force:true});
}
