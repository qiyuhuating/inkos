import type { Command } from "commander";
import { createRootProgram, type ProgramHooks } from "./root-program.js";
export type { ProgramHooks } from "./root-program.js";
export { runProgram } from "./startup.js";
import { initCommand } from "./commands/init.js";
import { configCommand } from "./commands/config.js";
import { bookCommand } from "./commands/book.js";
import { chapterCommand } from "./commands/chapter.js";
import { writeCommand } from "./commands/write.js";
import { autoCommand } from "./commands/auto.js";
import { reviewCommand } from "./commands/review.js";
import { statusCommand } from "./commands/status.js";
import { radarCommand } from "./commands/radar.js";
import { upCommand, downCommand } from "./commands/daemon.js";
import { doctorCommand } from "./commands/doctor.js";
import { exportCommand } from "./commands/export.js";
import { reviseCommand } from "./commands/revise.js";
import { agentCommand } from "./commands/agent.js";
import { updateCommand } from "./commands/update.js";
import { detectCommand } from "./commands/detect.js";
import { styleCommand } from "./commands/style.js";
import { analyticsCommand } from "./commands/analytics.js";
import { importCommand } from "./commands/import.js";
import { fanficCommand } from "./commands/fanfic.js";
import { shortCommand } from "./commands/short-fiction.js";
import { forecastCommand } from "./commands/forecast.js";
import { translateCommand } from "./commands/translate.js";
import { createStudioCommand } from "./commands/studio-command.js";
import { createInteractCommand } from "./commands/interact.js";
import { createTuiCommand } from "./commands/tui.js";
import { workCommand } from "./commands/work.js";

/** Eager program factory retained for programmatic consumers. */
export function createProgram(hooks: ProgramHooks = {}): Command {
  const program = createRootProgram(hooks);
  program.addCommand(initCommand);
  program.addCommand(configCommand);
  program.addCommand(bookCommand);
  program.addCommand(workCommand);
  program.addCommand(chapterCommand);
  program.addCommand(writeCommand);
  program.addCommand(autoCommand);
  program.addCommand(reviewCommand);
  program.addCommand(statusCommand);
  program.addCommand(radarCommand);
  program.addCommand(upCommand);
  program.addCommand(downCommand);
  program.addCommand(doctorCommand);
  program.addCommand(exportCommand);
  program.addCommand(reviseCommand);
  program.addCommand(agentCommand);
  program.addCommand(updateCommand);
  program.addCommand(detectCommand);
  program.addCommand(styleCommand);
  program.addCommand(analyticsCommand);
  program.addCommand(importCommand);
  program.addCommand(fanficCommand);
  program.addCommand(shortCommand);
  program.addCommand(forecastCommand);
  program.addCommand(translateCommand);
  program.addCommand(createStudioCommand({
    launchStudio: hooks.launchStudio,
    recentProjectPath: hooks.studioRecentProjectPath,
  }));
  program.addCommand(createInteractCommand({
    readInput: hooks.readInteractionInput,
  }));
  program.addCommand(createTuiCommand({ launchTui: hooks.launchTui }));

  return program;
}
