import { estimateTextTokens } from "./provider.js";
import { splitTextByEstimatedTokens } from "./semantic-input.js";

export interface SemanticReductionOptions {
  readonly text: string;
  readonly inputBudget: number;
  readonly outputBudget: number;
  readonly signal?: AbortSignal;
  readonly compile: (text: string, maxTokens: number) => Promise<string>;
}

/** Ordered map/reduce with an explicit decrease invariant; a model cannot
 * trigger unbounded recursion by returning oversized summaries. */
export async function reduceSemanticText(options: SemanticReductionOptions): Promise<string> {
  const { inputBudget, outputBudget, compile, signal } = options;
  if (!Number.isSafeInteger(inputBudget) || inputBudget < 4
    || !Number.isSafeInteger(outputBudget) || outputBudget < 1) {
    throw new Error("Invalid semantic reduction budget.");
  }
  let text = options.text;
  let tokens = estimateTextTokens(text);
  const intermediateBudget = Math.min(outputBudget, Math.max(1, Math.floor(inputBudget / 4)));
  for (let pass = 0; tokens > inputBudget; pass++) {
    signal?.throwIfAborted();
    if (pass >= 16) throw Object.assign(new Error("Context reduction exceeded its pass limit."), {code:"CONTEXT_REDUCTION_LIMIT"});
    const chunks = splitTextByEstimatedTokens(text, inputBudget);
    const summaries: string[] = [];
    for (const chunk of chunks) {
      signal?.throwIfAborted();
      const summary = (await compile(chunk, intermediateBudget)).trim();
      if (!summary) throw new Error("Context reduction returned an empty segment.");
      summaries.push(summary);
    }
    const reduced = summaries.join("\n\n");
    const nextTokens = estimateTextTokens(reduced);
    if (nextTokens >= tokens) throw Object.assign(new Error("Context reduction did not reduce its input."), {code:"CONTEXT_REDUCTION_NO_PROGRESS"});
    text = reduced;
    tokens = nextTokens;
  }
  signal?.throwIfAborted();
  const final = (await compile(text, outputBudget)).trim();
  if (!final) throw new Error("Context reduction returned empty content.");
  if (estimateTextTokens(final) > outputBudget) {
    throw Object.assign(new Error("Context reduction exceeded its output budget."), {code:"CONTEXT_OUTPUT_OVER_BUDGET"});
  }
  return final;
}
