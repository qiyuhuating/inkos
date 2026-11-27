import { describe, expect, it } from "vitest";
import { PipelineRunner } from "../pipeline/runner.js";
import { createLLMClient } from "../llm/provider.js";
import { contextBudgetFromClient } from "../agents/composer.js";
import type { LLMConfig } from "../models/project.js";

describe("stage model routing", () => {
  it("keeps model-specific budgets and reuses a matching stage client", () => {
    const base: LLMConfig = {
      provider: "openai", service: "openai", configSource: "env",
      baseUrl: "https://api.openai.com/v1", apiKey: "fixture",
      model: "gpt-4.1", apiFormat: "chat", stream: true, temperature: 0.7, thinkingBudget: 0,
    };
    const client = createLLMClient(base);
    const runner = new PipelineRunner({
      projectRoot: ".", client, model: base.model, defaultLLMConfig: base,
      modelOverrides: {
        planner: "gpt-4o-mini", composer: "gpt-4o-mini",
        writer: "gpt-4.1", auditor: { model: "gpt-4o", stream: false },
      },
    });
    const planner = runner.createAgentContext("planner");
    const composer = runner.createAgentContext("composer");
    const writer = runner.createAgentContext("writer");
    const auditor = runner.createAgentContext("auditor");
    expect(planner.client).toBe(composer.client);
    expect(planner.model).toBe("gpt-4o-mini");
    expect(contextBudgetFromClient(planner.client)).toEqual({ contextWindowTokens: 128000, reservedOutputTokens: 16384 });
    expect(contextBudgetFromClient(writer.client)).toEqual({ contextWindowTokens: 1047576, reservedOutputTokens: 32768 });
    expect(auditor.client.stream).toBe(false);
    expect(auditor.client.defaults.maxTokens).toBe(4096);
    expect(runner.createAgentContext("radar").client).toBe(client);
  });
});
