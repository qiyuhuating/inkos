import type { LLMClient } from "./provider.js";

export function semanticInputBudget(
  client: LLMClient,
  options: { readonly reservedOutputTokens: number; readonly promptOverheadTokens?: number },
): number | undefined {
  const contextWindow = client._piModel?.contextWindow;
  if (!contextWindow || !Number.isFinite(contextWindow)) return undefined;
  const overhead = options.promptOverheadTokens ?? 4096;
  return Math.max(1, contextWindow - options.reservedOutputTokens - overhead);
}

/** Lossless Unicode split; prefer record/line boundaries without rescanning
 * growing strings or materializing a code-point array for oversized records. */
export function splitTextByEstimatedTokens(text: string, budgetTokens: number): string[] {
  if (!Number.isSafeInteger(budgetTokens) || budgetTokens < 1) throw new Error("Invalid semantic input budget.");
  if (!text) return [text];
  const capacity = budgetTokens * 4;
  const chunks: string[] = [];
  let start = 0, index = 0, units = 0, lastBreak = 0;
  while (index < text.length) {
    const cp = text.codePointAt(index)!;
    const width = cp > 0xffff ? 2 : 1;
    const cost = cp >= 0x3400 && cp <= 0x9fff ? 4 : width;
    if (units + cost > capacity) {
      const boundary = lastBreak > start ? lastBreak : index;
      chunks.push(text.slice(start,boundary));
      start = index = lastBreak = boundary;
      units = 0;
      continue;
    }
    index += width;
    units += cost;
    if (cp === 10) lastBreak = index;
  }
  if (start < text.length) chunks.push(text.slice(start));
  return chunks;
}
