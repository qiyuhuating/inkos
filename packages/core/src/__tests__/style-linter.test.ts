import { describe, expect, it } from "vitest";
import { applyStyleRepairs, continuityStyleHints, lintChapterStyle, styleRepairTargets } from "../style-linter.js";
import type { CurrentStateFact } from "../models/runtime-state.js";

describe("chapter style linter", () => {
  it("flags stock narration without treating dialogue as narration", () => {
    const text = "命运的齿轮开始转动。\n\n「一切才刚刚开始。」老许说。\n\n周砚把票塞回口袋。";
    const issues = lintChapterStyle(text);
    expect(issues).toEqual([{ paragraph: 0, code: "stock-phrase", evidence: "命运的齿轮开始转动" }]);
    expect(styleRepairTargets(text, issues)[0]?.after).toBe("「一切才刚刚开始。」老许说。");
    expect(applyStyleRepairs(text, [{ paragraph: 0, replacement: "汽车站外响起喇叭声。" }])).toBe(
      "汽车站外响起喇叭声。\n\n「一切才刚刚开始。」老许说。\n\n周砚把票塞回口袋。",
    );
  });

  it("counts double Chinese dashes as one and enforces the chapter-wide limit", () => {
    const paragraph = "甲".repeat(1000);
    expect(lintChapterStyle(paragraph + "——乙——丙")).toEqual([]);
    expect(lintChapterStyle(paragraph + "——乙——丙——丁")).toMatchObject([{ code: "dash-density" }]);
  });

  it("preserves blank lines and rejects patches to unflagged or duplicate paragraphs", () => {
    const text = "一切才刚刚开始。\r\n\r\n  周砚拿起车票。";
    expect(applyStyleRepairs(text, [{ paragraph: 0, replacement: "车门开了。" }])).toBe("车门开了。\r\n\r\n  周砚拿起车票。");
    expect(() => applyStyleRepairs(text, [{ paragraph: 1, replacement: "周砚丢了车票。" }])).toThrow();
    expect(() => applyStyleRepairs(text, [{ paragraph: 0, replacement: "车门开了。" }, { paragraph: 0, replacement: "车门关了。" }])).toThrow();
    expect(() => applyStyleRepairs(text, [{ paragraph: 0, replacement: "车门开了。\n\n车门关了。" }])).toThrow();
    expect(() => applyStyleRepairs(text, [{ paragraph: 0, replacement: "命运的齿轮开始转动。" }])).toThrow();
    expect(applyStyleRepairs(text, [{ paragraph: 0, replacement: "一切才刚刚开始。" }])).toBe(text);
  });

  it("flags only possible contradictions against active injury and possession facts", () => {
    const facts: CurrentStateFact[] = [
      { subject: "周砚", predicate: "伤势", object: "右手划伤", validFromChapter: 1, validUntilChapter: null, sourceChapter: 1 },
      { subject: "周砚", predicate: "持有道具", object: "怀表", validFromChapter: 1, validUntilChapter: null, sourceChapter: 1 },
      { subject: "老许", predicate: "伤势", object: "骨折", validFromChapter: 1, validUntilChapter: 1, sourceChapter: 1 },
    ];
    expect(continuityStyleHints("周砚毫发无伤。\n\n周砚从未拥有怀表。\n\n老许毫发无伤。", facts, 2)).toEqual([
      "周砚 / 伤势 / 右手划伤",
      "周砚 / 持有道具 / 怀表",
    ]);
    expect(continuityStyleHints("周砚把怀表装进口袋，重新包扎右手。", facts, 2)).toEqual([]);
  });
});
