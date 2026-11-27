import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { BigIntStats } from "node:fs";

function fingerprint(info: BigIntStats): string {
  return [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].join(":");
}

/** Process-local bounded cache. Every hit revalidates the source file identity. */
export class FingerprintFileCache<T> {
  private readonly entries = new Map<string, { fingerprint: string; bytes: number; value: T }>();
  private bytes = 0;

  constructor(
    private readonly decode: (text: string) => T,
    private readonly maxEntries = 256,
    private readonly maxBytes = 8 * 1024 * 1024,
  ) {}

  private remove(path: string): void {
    const old = this.entries.get(path);
    if (!old) return;
    this.bytes -= old.bytes;
    this.entries.delete(path);
  }

  async read(path: string): Promise<T> {
    const key = resolve(path);
    let before: BigIntStats;
    try {
      before = await stat(key, { bigint: true });
    } catch (error) {
      this.remove(key);
      throw error;
    }
    const identity = fingerprint(before);
    const cached = this.entries.get(key);
    if (cached?.fingerprint === identity) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached.value;
    }
    this.remove(key);
    const text = await readFile(key, "utf8");
    const value = this.decode(text);
    const after = await stat(key, { bigint: true });
    const bytes = Number(after.size);
    // Don't cache a read that raced a write or an atomic replacement.
    if (identity !== fingerprint(after) || bytes > this.maxBytes) return value;
    this.remove(key);
    while (this.entries.size >= this.maxEntries || this.bytes + bytes > this.maxBytes) {
      this.remove(this.entries.keys().next().value!);
    }
    this.entries.set(key, { fingerprint: identity, bytes, value });
    this.bytes += bytes;
    return value;
  }
}
