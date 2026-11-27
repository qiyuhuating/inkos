import { createRequire } from "node:module";
import { Command } from "commander";
import type { InteractCommandHooks } from "./commands/interact.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

export interface ProgramHooks {
  readonly launchTui?: (projectRoot: string) => Promise<void> | void;
  readonly launchStudio?: (projectRoot: string, port: string) => Promise<void> | void;
  readonly studioRecentProjectPath?: string;
  readonly readInteractionInput?: InteractCommandHooks["readInput"];
}

export function createRootProgram(hooks: ProgramHooks = {}): Command {
  const program = new Command();

  program
    .name("inkos")
    .description("InkOS — Multi-agent novel production system")
    .version(version)
    .enablePositionalOptions()
    .option("--service <service>", "Override LLM service for this CLI run")
    .option("--model <model>", "Override LLM model for this CLI run")
    .option("--api-key-env <envVar>", "Read LLM API key from this environment variable for this CLI run")
    .option("--base-url <url>", "Override LLM base URL for this CLI run")
    .option("--api-format <chat|responses|anthropic>", "Override LLM API format for this CLI run")
    .option("--stream", "Force streaming LLM responses for this CLI run")
    .option("--no-stream", "Force non-streaming LLM responses for this CLI run")
    .action(async () => {
      const { launchStudioEntry } = await import("./commands/studio.js");
      await launchStudioEntry(process.cwd(), "4567", {
        launchStudio: hooks.launchStudio,
        recentProjectPath: hooks.studioRecentProjectPath,
      });
    });

  return program;
}
