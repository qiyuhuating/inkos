import type { CurrentStateFact } from "./models/runtime-state.js";

export interface StyleIssue {
  readonly paragraph: number;
  readonly code: "stock-phrase" | "dash-density";
  readonly evidence: string;
}

export interface StyleRepair {
  readonly paragraph: number;
  readonly replacement: string;
}

const STOCK_PHRASES = [
  "命运的齿轮开始转动",
  "命运的齿轮悄然转动",
  "一切才刚刚开始",
  "仿佛整个世界都安静了下来",
  "时间仿佛在这一刻静止",
  "心中涌起一股难以言喻的",
  "the wheels of fate began to turn",
  "little did they know",
  "little did he know",
  "little did she know",
  "a testament to the human spirit",
] as const;

function parts(content: string): string[] {
  return content.split(/(\r?\n[ \t]*\r?\n(?:[ \t]*\r?\n)*)/);
}

function narration(text: string): string {
  return text.replace(/「[^」]*」|『[^』]*』|“[^”]*”|"[^"\r\n]*"/gu, " ");
}

function phrases(text: string): string[] {
  const prose = narration(text).toLowerCase();
  return STOCK_PHRASES.filter((phrase) => prose.includes(phrase));
}

function dashes(text: string): number {
  return (text.match(/[—–]+|(?<=\s)--(?=\s)/gu) ?? []).length;
}

function dashExcess(content: string): number {
  const length = [...content.replace(/\s/gu, "")].length;
  return Math.max(0, dashes(content) - Math.floor(length * 2 / 1000));
}

export function lintChapterStyle(content: string): StyleIssue[] {
  const issues: StyleIssue[] = [];
  const paragraphs = parts(content);
  const excess = dashExcess(content);
  for (let i = 0; i < paragraphs.length; i += 2) {
    const paragraph = paragraphs[i]!;
    for (const phrase of phrases(paragraph)) {
      issues.push({ paragraph: i / 2, code: "stock-phrase", evidence: phrase });
    }
    if (excess && dashes(paragraph)) {
      issues.push({ paragraph: i / 2, code: "dash-density", evidence: String(excess) + " excess dash(es) in chapter" });
    }
  }
  return issues;
}

export function styleRepairTargets(content: string, issues: readonly StyleIssue[]) {
  const paragraphs = parts(content);
  return [...new Set(issues.map((issue) => issue.paragraph))].map((paragraph) => ({
    paragraph,
    text: paragraphs[paragraph * 2]!,
    before: paragraphs[paragraph * 2 - 2],
    after: paragraphs[paragraph * 2 + 2],
    issues: issues.filter((issue) => issue.paragraph === paragraph),
  }));
}

/** Never permit a style repair to replace an unflagged paragraph or its separators. */
export function applyStyleRepairs(content: string, repairs: readonly StyleRepair[]): string {
  const issues = lintChapterStyle(content);
  const allowed = new Set(issues.map((issue) => issue.paragraph));
  const paragraphs = parts(content);
  const seen = new Set<number>();
  for (const repair of repairs) {
    const replacement = repair.replacement.trim();
    const index = repair.paragraph * 2;
    if (!allowed.has(repair.paragraph) || seen.has(repair.paragraph)
        || !replacement || /\r?\n[ \t]*\r?\n/u.test(replacement)) {
      throw new Error("Style repair must replace one distinct flagged paragraph.");
    }
    seen.add(repair.paragraph);
    const original = paragraphs[index]!;
    if (phrases(replacement).some((phrase) => !phrases(original).includes(phrase))) {
      throw new Error("Style repair introduced a new stock phrase.");
    }
    paragraphs[index] = original.replace(/\S[\s\S]*\S|\S/u, () => replacement);
  }
  const candidate = paragraphs.join("");
  const stockCount = (value: string) => lintChapterStyle(value).filter((issue) => issue.code === "stock-phrase").length;
  const beforeStock = stockCount(content);
  const afterStock = stockCount(candidate);
  const beforeDashes = dashExcess(content);
  const afterDashes = dashExcess(candidate);
  return afterStock <= beforeStock && afterDashes <= beforeDashes
    && (afterStock < beforeStock || afterDashes < beforeDashes) ? candidate : content;
}

/** Conservative review hints, not proof of contradiction or permission to rewrite canon. */
export function continuityStyleHints(content: string, facts: readonly CurrentStateFact[], chapter: number): string[] {
  const hints: string[] = [];
  for (const fact of facts) {
    if (fact.validFromChapter > chapter || (fact.validUntilChapter !== null && fact.validUntilChapter < chapter)) continue;
    for (const paragraph of parts(content)) {
      const prose = narration(paragraph);
      if (!prose.includes(fact.subject)) continue;
      const injury = /伤势|injury/i.test(fact.predicate)
        && /受伤|伤口|划伤|骨折|流血|wound|injur|fractur/i.test(fact.object)
        && /毫发无伤|从未受伤|uninjured|never injured/i.test(prose);
      const item = /持有|inventory|possess/i.test(fact.predicate)
        && prose.includes(fact.object)
        && /从未拥有|从未持有|never owned|never possessed/i.test(prose);
      if (injury || item) {
        hints.push(fact.subject + " / " + fact.predicate + " / " + fact.object);
        break;
      }
    }
  }
  return [...new Set(hints)];
}
