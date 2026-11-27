import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { decodeDocumentText, readLimitedDocument, readLimitedResponse } from "../utils/document-input.js";
import { ingestMaterial } from "../materials/ingest.js";

describe("document input", () => {
  it("decodes UTF-16 with BOM, retains literal entities, and rejects invalid binary text", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkos-document-input-"));
    try {
      const original = "第一段 &lt;tag&gt;\r\n\r\n第二段。";
      const buffer = Buffer.concat([Buffer.from([0xff,0xfe]), Buffer.from(original, "utf16le")]);
      await writeFile(join(root, "source.txt"), buffer);
      expect(decodeDocumentText(buffer)).toBe(original);
      const asset = await ingestMaterial(root, {sourceKind:"file",filePath:"source.txt"});
      const { readFile } = await import("node:fs/promises");
      expect(await readFile(join(root, asset.markdownPath), "utf8")).toContain("第一段 &lt;tag&gt;\n\n第二段。");
      expect(() => decodeDocumentText(Buffer.from([0xff,0x01]))).toThrow();
      await expect(readLimitedDocument(join(root, "source.txt"), 8)).rejects.toThrow("size limit");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("cancels an oversized response stream before reading the whole document", async () => {
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(6)); },
      cancel() { cancelled = true; },
    });
    await expect(readLimitedResponse(new Response(source), 10)).rejects.toThrow("size limit");
    expect(cancelled).toBe(true);
    expect((await readLimitedResponse(new Response("normal"), 10)).toString("utf8")).toBe("normal");
  });

  it("preserves HTML paragraph boundaries and inline text without adding spurious spaces", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkos-html-input-"));
    try {
      const asset = await ingestMaterial(root, {sourceKind:"url",url:"https://example.com/article"}, {
        fetch: async () => new Response("<html><title>Example</title><body><p>林<b>秋</b>说。</p><p>下一段 &amp; 文本。</p></body></html>", {headers:{"content-type":"text/html"}}),
      });
      const { readFile } = await import("node:fs/promises");
      const body = await readFile(join(root,asset.markdownPath),"utf8");
      expect(body).toContain("林秋说。\n\n下一段 & 文本。");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
