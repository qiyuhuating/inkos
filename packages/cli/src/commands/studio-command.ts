import { Command } from "commander";
import { resolve } from "node:path";
import { findProjectRoot } from "../utils.js";
import type { StudioCommandHooks } from "./studio.js";

export function createStudioCommand(hooks: StudioCommandHooks = {}): Command {
  return new Command("studio")
  .description("Start InkOS Studio web workbench")
  .option("-p, --port <port>", "Server port", "4567")
  .option("--project <path>", "Open or initialize a specific InkOS project directory")
  .action(async (opts) => {
    const root = opts.project ? resolve(opts.project) : findProjectRoot();
    const port = opts.port;
    const { launchStudioEntry } = await import("./studio.js");
    await launchStudioEntry(root, port, hooks, { explicitProject: Boolean(opts.project) });
  });
}

export const studioCommand = createStudioCommand();
