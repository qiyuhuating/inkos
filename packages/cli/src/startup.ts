import { Command, Help } from "commander";
import { createRootProgram, type ProgramHooks } from "./root-program.js";

interface CommandEntry {
  name: string;
  term: string;
  description: string;
  alias?: string;
  load: (hooks: ProgramHooks) => Promise<Command>;
}

// Only the top-level help catalog is eager. Detailed options and validation
// remain in the original command modules and are loaded by the selected command.
const commands: readonly CommandEntry[] = [
  { name: "init", term: "init [options] [name]", description: "Initialize an InkOS project (current directory by default)", load: async () => (await import("./commands/init.js")).initCommand },
  { name: "config", term: "config", description: "Manage project configuration", load: async () => (await import("./commands/config.js")).configCommand },
  { name: "book", term: "book", description: "Manage books", load: async () => (await import("./commands/book.js")).bookCommand },
  { name: "work", term: "work", description: "Inspect creative Works, artifacts, revisions, and Episodes", load: async () => (await import("./commands/work.js")).workCommand },
  { name: "chapter", term: "chapter", description: "Manage chapters", load: async () => (await import("./commands/chapter.js")).chapterCommand },
  { name: "write", term: "write", description: "Write chapters", load: async () => (await import("./commands/write.js")).writeCommand },
  { name: "auto", term: "auto [options] <args...>", description: "Auto-write chapters until the book reaches a target chapter number: auto [book-id] <target-chapter>", load: async () => (await import("./commands/auto.js")).autoCommand },
  { name: "review", term: "review [options] [book-id]", description: "Show persisted review observations", load: async () => (await import("./commands/review.js")).reviewCommand },
  { name: "status", term: "status [options] [book-id]", description: "Show project status", load: async () => (await import("./commands/status.js")).statusCommand },
  { name: "radar", term: "radar", description: "Market intelligence", load: async () => (await import("./commands/radar.js")).radarCommand },
  { name: "up", term: "up [options]", description: "Start the InkOS daemon (autonomous mode)", load: async () => (await import("./commands/daemon.js")).upCommand },
  { name: "down", term: "down", description: "Stop the InkOS daemon", load: async () => (await import("./commands/daemon.js")).downCommand },
  { name: "doctor", term: "doctor [options]", description: "Check environment and project health", load: async () => (await import("./commands/doctor.js")).doctorCommand },
  { name: "export", term: "export [options] [book-id]", description: "Export book chapters to a single file", load: async () => (await import("./commands/export.js")).exportCommand },
  { name: "revise", term: "revise [options] [book-id] [chapter]", description: "Revise a chapter from user direction and review observations", load: async () => (await import("./commands/revise.js")).reviseCommand },
  { name: "agent", term: "agent [options] <instruction>", description: "Natural language agent mode (LLM orchestrates via tool-use)", load: async () => (await import("./commands/agent.js")).agentCommand },
  { name: "update", term: "update", description: "Update InkOS to the latest version", load: async () => (await import("./commands/update.js")).updateCommand },
  { name: "detect", term: "detect [options] [book-id] [chapter]", description: "Run AIGC detection on chapters", load: async () => (await import("./commands/detect.js")).detectCommand },
  { name: "style", term: "style", description: "Compile a reference text into an operational style guide", load: async () => (await import("./commands/style.js")).styleCommand },
  { name: "analytics", term: "analytics|stats [options] [book-id]", alias: "stats", description: "Show analytics and token stats for a book", load: async () => (await import("./commands/analytics.js")).analyticsCommand },
  { name: "import", term: "import", description: "Import external data into a book", load: async () => (await import("./commands/import.js")).importCommand },
  { name: "fanfic", term: "fanfic", description: "Fan fiction writing tools", load: async () => (await import("./commands/fanfic.js")).fanficCommand },
  { name: "short", term: "short", description: "Short fiction production workflow", load: async () => (await import("./commands/short-fiction.js")).shortCommand },
  { name: "forecast", term: "forecast", description: "Narrative forecast: compare non-canonical future branches before writing", load: async () => (await import("./commands/forecast.js")).forecastCommand },
  { name: "translate", term: "translate", description: "Translate and localize novels/scripts across languages", load: async () => (await import("./commands/translate.js")).translateCommand },
  { name: "studio", term: "studio [options]", description: "Start InkOS Studio web workbench", load: async hooks => (await import("./commands/studio-command.js")).createStudioCommand({ launchStudio: hooks.launchStudio, recentProjectPath: hooks.studioRecentProjectPath }) },
  { name: "interact", term: "interact [options] [message...]", description: "Run a natural-language agent interaction against the current project", load: async hooks => (await import("./commands/interact.js")).createInteractCommand({ readInput: hooks.readInteractionInput }) },
  { name: "tui", term: "tui", description: "Open the InkOS project workspace TUI", load: async hooks => (await import("./commands/tui.js")).createTuiCommand({ launchTui: hooks.launchTui }) },
];

function catalogCommand(entry: CommandEntry): Command {
  const command = new Command(entry.name).description(entry.description);
  if (entry.alias) command.alias(entry.alias);
  return command;
}

export async function createLazyProgram(args: readonly string[], hooks: ProgramHooks = {}): Promise<Command> {
  const probe = createRootProgram(hooks);
  for (const entry of commands) probe.addCommand(catalogCommand(entry));
  // Use Commander's own option parser, including values, aliases and positional
  // options, instead of interpreting the raw argument vector ourselves.
  const { operands } = probe.parseOptions([...args]);
  const name = operands[0] === "help" ? operands[1] : operands[0];
  const selected = commands.find(entry => entry.name === name || entry.alias === name && name !== undefined);

  const program = createRootProgram(hooks);
  program.configureHelp({
    subcommandTerm(command) {
      const entry = command.parent === program ? commands.find(item => item.name === command.name()) : undefined;
      return entry?.term ?? Help.prototype.subcommandTerm.call(this, command);
    },
  });
  for (const entry of commands) {
    program.addCommand(entry === selected ? await entry.load(hooks) : catalogCommand(entry));
  }
  return program;
}

export async function runProgram(argv: string[] = process.argv, hooks: ProgramHooks = {}): Promise<void> {
  const program = await createLazyProgram(argv.slice(2), hooks);
  program.hook("preAction", async () => {
    const { recoverAtomicFileSets } = await import("@actalk/inkos-core/utils/atomic-file-set");
    await recoverAtomicFileSets(process.cwd(), true);
  });
  await program.parseAsync(argv);
}
