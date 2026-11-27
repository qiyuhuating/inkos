import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ingestMaterial } from "../materials/ingest.js";
import { retrieveMaterials } from "../materials/retrieve.js";
import { createRetrieveMaterialTool } from "../agent/agent-tools.js";
import { estimateTextTokens } from "../llm/provider.js";

describe("material retrieval", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "inkos-material-retrieve-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("returns traceable snippets from archived materials", async () => {
    await writeFile(join(root, "cold.md"), [
      "# 冷库旧账",
      "",
      "赔偿款在 0607 账页后被拆成三笔转出。",
      "冻品走私线索藏在入库单和司机签名里。",
    ].join("\n"), "utf-8");
    await writeFile(join(root, "romance.md"), [
      "# 恋爱线",
      "",
      "女主在海边车站归还钥匙，重点是误会后的情绪修复。",
    ].join("\n"), "utf-8");

    await ingestMaterial(root, {
      sourceKind: "file",
      filePath: "cold.md",
      purpose: "research",
    }, { now: () => new Date("2026-07-03T00:00:00.000Z") });
    await ingestMaterial(root, {
      sourceKind: "file",
      filePath: "romance.md",
      purpose: "reference",
    }, { now: () => new Date("2026-07-03T00:01:00.000Z") });

    const results = await retrieveMaterials(root, {
      query: "冷库 赔偿款 0607 账页",
      limit: 2,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("cold");
    expect(results[0]?.excerpt).toContain("赔偿款");
    expect(results[0]?.markdownPath).toMatch(/^\.inkos\/materials\//);
    expect(results[0]?.charStart).toBeGreaterThanOrEqual(0);
    expect(results[0]?.charEnd).toBeGreaterThan(results[0]?.charStart ?? 0);
  });

  it("bounds model-visible retrieval without losing the full host evidence", async () => {
    const excerpt = "冷库账页签收单".repeat(2000);
    await writeFile(join(root, "first.md"), excerpt, "utf8");
    await writeFile(join(root, "second.md"), excerpt, "utf8");
    await ingestMaterial(root, { sourceKind: "file", filePath: "first.md", purpose: "research" });
    await ingestMaterial(root, { sourceKind: "file", filePath: "second.md", purpose: "research" });
    const result = await createRetrieveMaterialTool(root).execute("fixture", { query: "冷库 账页 签收单", limit: 5 });
    const text = result.content.map(part => part.type === "text" ? part.text : "").join("\n");
    expect(estimateTextTokens(text)).toBeLessThanOrEqual(4096);
    expect(text).toContain("Partial excerpt");
    expect(text).toContain("path: .inkos/materials/");
    expect(text).toContain("1 duplicate or over-budget");
    expect((result.details as { results: { excerpt: string }[] }).results).toHaveLength(2);
    expect((result.details as { results: { excerpt: string }[] }).results[0]?.excerpt).toContain(excerpt);
  });

  it("can filter retrieval by material purpose", async () => {
    await writeFile(join(root, "research.md"), "现实冷库需要入库单、签收单和温控记录。", "utf-8");
    await writeFile(join(root, "script.md"), "分镜阶段需要镜头号、景别和动作。", "utf-8");

    await ingestMaterial(root, {
      sourceKind: "file",
      filePath: "research.md",
      purpose: "research",
    }, { now: () => new Date("2026-07-03T00:00:00.000Z") });
    await ingestMaterial(root, {
      sourceKind: "file",
      filePath: "script.md",
      purpose: "script",
    }, { now: () => new Date("2026-07-03T00:01:00.000Z") });

    const results = await retrieveMaterials(root, {
      query: "镜头 分镜 动作",
      purpose: "script",
      limit: 3,
    });

    expect(results.map((result) => result.purpose)).toEqual(["script"]);
    expect(results[0]?.excerpt).toContain("分镜");
  });
});
