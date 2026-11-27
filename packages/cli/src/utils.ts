import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createLLMClient } from "@actalk/inkos-core/llm/provider";
import { findProjectRoot } from "./project-io.js";
export { findProjectRoot, log, logError, resolveBookId } from "./project-io.js";
import { createLogger, createStderrSink, createJsonLineSink } from "@actalk/inkos-core/utils/logger";
import { resolveEffectiveLLMConfig } from "@actalk/inkos-core/utils/effective-llm-config";
import { loadLLMEnvLayers, GLOBAL_CONFIG_DIR, GLOBAL_ENV_PATH } from "@actalk/inkos-core/utils/llm-env";
import { createBuiltInWorkProfileRegistry } from "@actalk/inkos-core/harness/builtin-profiles";
import { loadAvailableAgentSkills } from "@actalk/inkos-core/skills/builtin-loader";
import { mergeActivatedSkillGuidance, resolveProfileSkillActivations } from "@actalk/inkos-core/skills/activations";
import type { ActivatedSkillGuidance, EffectiveLLMConfigResult, LLMApiFormat, LLMConfigCliOverrides, ProjectConfig, PipelineConfig, LogSink } from "@actalk/inkos-core";

export { GLOBAL_CONFIG_DIR, GLOBAL_ENV_PATH };


export async function resolveContext(opts: {
  readonly context?: string;
  readonly contextFile?: string;
}): Promise<string | undefined> {
  if (opts.context) return opts.context;
  if (opts.contextFile) {
    return readFile(resolve(opts.contextFile), "utf-8");
  }
  // Read from stdin if piped (non-TTY)
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    const text = Buffer.concat(chunks).toString("utf-8").trim();
    if (text.length > 0) return text;
  }
  return undefined;
}

export async function resolveCliProfileSkills(
  projectRoot: string,
  profileId: string,
  options: { readonly includeRecommended?: boolean; readonly extraSkillIds?: ReadonlyArray<string> } = {},
): Promise<ActivatedSkillGuidance[]> {
  const available = await loadAvailableAgentSkills({ projectRoot });
  const profileSkills = resolveProfileSkillActivations(
    available.skills,
    createBuiltInWorkProfileRegistry().require(profileId),
    { includeRecommended: options.includeRecommended },
  );
  const byId = new Map(available.skills.map((skill) => [skill.id, skill]));
  const extras = (options.extraSkillIds ?? []).map((id) => {
    const skill = byId.get(id);
    if (!skill) throw new Error(`CLI operation requires unavailable skill: ${id}`);
    return { skill, resources: [] };
  });
  return mergeActivatedSkillGuidance(profileSkills, extras);
}

export async function loadConfig(options?: {
  readonly requireApiKey?: boolean;
  readonly projectRoot?: string;
  readonly cli?: LLMConfigCliOverrides;
}): Promise<ProjectConfig> {
  return (await loadConfigWithDiagnostics(options)).config;
}

export async function loadConfigWithDiagnostics(options?: {
  readonly requireApiKey?: boolean;
  readonly projectRoot?: string;
  readonly cli?: LLMConfigCliOverrides;
}): Promise<EffectiveLLMConfigResult> {
  const root = options?.projectRoot ?? findProjectRoot();
  const cli = {
    ...parseLLMOverridesFromArgv(process.argv.slice(2)),
    ...options?.cli,
  };
  const envLayers = await loadLLMEnvLayers(root);
  return resolveEffectiveLLMConfig({
    consumer: "cli",
    projectRoot: root,
    envLayers,
    cli,
    requireApiKey: options?.requireApiKey,
  });
}

export function createClient(config: ProjectConfig) {
  return createLLMClient(config.llm);
}

export function parseLLMOverridesFromArgv(argv: readonly string[]): LLMConfigCliOverrides {
  const overrides: {
    service?: string;
    model?: string;
    apiKeyEnv?: string;
    baseUrl?: string;
    apiFormat?: LLMApiFormat;
    stream?: boolean;
  } = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;

    const [flag, inlineValue] = arg.split("=", 2) as [string, string | undefined];
    const nextValue = () => inlineValue ?? argv[++i];

    if (flag === "--service") {
      const value = nextValue();
      if (value) overrides.service = value;
    } else if (flag === "--model") {
      const value = nextValue();
      if (value) overrides.model = value;
    } else if (flag === "--api-key-env") {
      const value = nextValue();
      if (value) overrides.apiKeyEnv = value;
    } else if (flag === "--base-url") {
      const value = nextValue();
      if (value) overrides.baseUrl = value;
    } else if (flag === "--api-format") {
      const value = nextValue();
      if (value === "chat" || value === "responses" || value === "anthropic") overrides.apiFormat = value;
    } else if (flag === "--stream") {
      overrides.stream = true;
    } else if (flag === "--no-stream") {
      overrides.stream = false;
    }
  }

  return overrides;
}

export function buildPipelineConfig(
  config: ProjectConfig,
  root: string,
  extra?: Partial<Pick<PipelineConfig, "notifyChannels" | "radarSources" | "externalContext">> & {
    readonly quiet?: boolean;
    readonly logFile?: NodeJS.WritableStream;
  },
): PipelineConfig {
  const sinks: LogSink[] = [];
  if (!extra?.quiet) {
    sinks.push(createStderrSink({ minLevel: "info" }));
  }
  if (extra?.logFile) {
    sinks.push(createJsonLineSink(extra.logFile));
  }

  const hasLogging = sinks.length > 0;
  const logger = hasLogging ? createLogger({ tag: "inkos", sinks }) : undefined;

  const onStreamProgress = hasLogging
    ? (progress: { readonly elapsedMs: number; readonly totalChars: number; readonly chineseChars: number; readonly status: string }) => {
        if (progress.status === "streaming") {
          logger?.info(
            `streaming ${Math.round(progress.elapsedMs / 1000)}s, ${progress.totalChars} chars (${progress.chineseChars} CJK)`,
          );
        }
      }
    : undefined;

  return {
    client: createLLMClient(config.llm),
    model: config.llm.model,
    projectRoot: root,
    defaultLLMConfig: config.llm,
    modelOverrides: config.modelOverrides,
    notifyChannels: extra?.notifyChannels ?? config.notify,
    radarSources: extra?.radarSources,
    externalContext: extra?.externalContext,
    logger,
    onStreamProgress,
  };
}
