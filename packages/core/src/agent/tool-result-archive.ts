import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Type } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { actionResultFacts } from "../harness/action-observation.js";

const ARCHIVE_THRESHOLD = 32 * 1024;
const PAGE_BYTES = 8 * 1024;

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

async function publish(path: string, data: string): Promise<void> {
  const temporary = path + "." + randomUUID() + ".tmp";
  try {
    await writeFile(temporary, data, "utf8");
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export class ToolResultArchive {
  private readonly directory: string;

  constructor(projectRoot: string, sessionId: string) {
    this.directory = join(projectRoot, ".inkos", "tool-results", sha256(sessionId));
  }

  async remove(): Promise<void> {
    await rm(this.directory, { recursive: true, force: true });
  }

  async project(result: AgentToolResult<unknown>): Promise<AgentToolResult<unknown>> {
    if (result.content.length !== 1 || result.content[0]?.type !== "text") return result;
    const text = result.content[0].text;
    const bytes = Buffer.byteLength(text);
    if (bytes <= ARCHIVE_THRESHOLD) return result;
    const details = result.details as Record<string, unknown> | undefined;
    const full = JSON.stringify(result);
    const id = sha256(full);
    const contentHash = sha256(JSON.stringify(result.content));
    await mkdir(this.directory, { recursive: true });
    // Publish both the exact result and its model-facing text before exposing
    // the reference. A failed write never replaces the tool result.
    await publish(join(this.directory, id + ".json"), full);
    await publish(join(this.directory, id + ".txt"), text);
    const preview = await this.read(id, 0);
    const facts = actionResultFacts(details);
    // Keep control/address facts, not another copy of arbitrary prose.
    const boundedFacts = Object.fromEntries(Object.entries(facts).filter(([, value]) => {
      if (typeof value === "string") return value.length <= 1024;
      return JSON.stringify(value).length <= 4096;
    }));
    const reference = { id, bytes, contentHash, nextOffset: preview.nextOffset };
    return {
      content: [{ type: "text", text: JSON.stringify({
        status: "success",
        archivedResult: reference,
        facts: boundedFacts,
        preview: preview.text,
        note: "This is a partial preview. Use read_archived_tool_result with the id and nextOffset (UTF-8 byte offset) for the exact remaining result. The preview does not establish that the rest was inspected.",
      }) }],
      details: {
        ...boundedFacts,
        displayText: preview.text,
        archivedResult: reference,
        recoveredToolCallIds: details?.recoveredToolCallIds,
        hostExecution: details?.hostExecution,
      },
    };
  }

  async read(id: string, offset: number): Promise<{ text: string; bytes: number; nextOffset: number | null }> {
    if (!/^[a-f0-9]{64}$/.test(id) || !Number.isSafeInteger(offset) || offset < 0) {
      throw new Error("Invalid archived tool result address.");
    }
    const file = await open(join(this.directory, id + ".txt"), "r");
    try {
      const { size } = await file.stat();
      if (offset > size) throw new Error("Archived result offset is past the end.");
      if (offset === size) return { text: "", bytes: size, nextOffset: null };
      const buffer = Buffer.alloc(Math.min(PAGE_BYTES + 1, size - offset));
      let bytesRead = 0;
      while (bytesRead < buffer.length) {
        const chunk = await file.read(buffer, bytesRead, buffer.length - bytesRead, offset + bytesRead);
        if (!chunk.bytesRead) throw new Error("Archived result changed during read.");
        bytesRead += chunk.bytesRead;
      }
      let end = Math.min(PAGE_BYTES, bytesRead);
      // Avoid splitting a UTF-8 scalar at a page boundary. The returned
      // offset is always an exact byte address in the original observation.
      while (end < bytesRead && end > 0 && (buffer[end]! & 0xc0) === 0x80) end--;
      const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, end));
      return { text, bytes: size, nextOffset: offset + end < size ? offset + end : null };
    } finally {
      await file.close();
    }
  }

  tool(): AgentTool<ReturnType<typeof archiveReadParameters>> {
    return {
      name: "read_archived_tool_result",
      label: "Read archived tool result",
      description: "Read a bounded page of an exact earlier successful read result from this session. Use only the archive id and byte offsets returned by the host. This reads stored evidence, not a new source revision.",
      parameters: archiveReadParameters(),
      execute: async (_id, params, signal) => {
        signal?.throwIfAborted();
        const page = await this.read(params.id, params.offset ?? 0);
        return { content: [{ type: "text", text: JSON.stringify(page) }], details: { archivedResultId: params.id, nextOffset: page.nextOffset } };
      },
    };
  }
}

function archiveReadParameters() {
  return Type.Object({
    id: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    offset: Type.Optional(Type.Integer({ minimum: 0, description: "UTF-8 byte offset; omit to start at zero." })),
  });
}
