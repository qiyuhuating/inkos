import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

export async function readLimitedDocument(path: string, maxBytes: number): Promise<Buffer> {
  const info = await stat(path);
  if (info.size > maxBytes) throw new Error("Document exceeds the input size limit.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Document exceeds the input size limit.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

export async function readLimitedResponse(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > maxBytes) {
    await response.body?.cancel();
    throw new Error("Fetched document exceeds the input size limit.");
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("Fetched document exceeds the input size limit.");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally {
    reader.releaseLock();
  }
}

export function decodeDocumentText(buffer: Uint8Array): string {
  const encoding = buffer[0] === 0xff && buffer[1] === 0xfe ? "utf-16le"
    : buffer[0] === 0xfe && buffer[1] === 0xff ? "utf-16be" : "utf-8";
  const text = new TextDecoder(encoding, { fatal: true }).decode(buffer);
  if (text.includes("\0")) throw new Error("Binary content cannot be imported as text.");
  return text;
}

export async function extractPdfDocument(buffer: Buffer): Promise<{ text: string; totalPages: number }> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  try {
    return await extractText(pdf, { mergePages: true });
  } finally {
    await pdf.destroy();
  }
}
