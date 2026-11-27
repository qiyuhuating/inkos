import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm, rename, stat, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FingerprintFileCache } from "../utils/fingerprint-file-cache.js";

describe("fingerprint file cache", () => {
  it("skips rereads and decoding until file identity changes, with bounded retention", async () => {
    const dir=await mkdtemp(join(tmpdir(),"inkos-fingerprint-"));
    let decodes=0;
    const cache=new FingerprintFileCache(text=>({text,decode:++decodes}),2,64);
    const a=join(dir,"a.md"),b=join(dir,"b.md"),c=join(dir,"c.md");
    try {
      await writeFile(a,"first");
      const initial=await cache.read(a);
      expect(await cache.read(a)).toBe(initial);
      const old=await stat(a);
      await writeFile(b,"other");
      await utimes(b,old.atime,old.mtime);
      await rm(a);
      await rename(b,a);
      const replaced=await cache.read(a);
      expect(replaced.text).toBe("other");
      expect(replaced).not.toBe(initial);
      await writeFile(b,"second");
      await writeFile(c,"third");
      await cache.read(b);
      await cache.read(c);
      expect(await cache.read(a)).not.toBe(replaced);
      await rm(a);
      await expect(cache.read(a)).rejects.toMatchObject({code:"ENOENT"});
      await writeFile(a,"fresh");
      expect((await cache.read(a)).text).toBe("fresh");
    } finally {
      await rm(dir,{recursive:true,force:true});
    }
  });
});
