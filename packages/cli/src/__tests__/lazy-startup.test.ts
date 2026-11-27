import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createProgram } from "../program.js";
import { createLazyProgram } from "../startup.js";

const entry = fileURLToPath(new URL("../../dist/index.js", import.meta.url));

describe("lazy CLI startup", () => {
  it("preserves root help and all 28 command definitions with global option values", async () => {
    const eager = createProgram();
    const expected = eager.commands.map(command => ({
      name: command.name(), help: command.helpInformation(),
    }));
    expect((await createLazyProgram([])).helpInformation()).toBe(eager.helpInformation());
    for (const command of expected) {
      const lazy = await createLazyProgram(["--model", "fixture", command.name, "--help"]);
      expect(lazy.commands.find(item => item.name() === command.name)?.helpInformation()).toBe(command.help);
    }
    const alias = await createLazyProgram(["stats", "--help"]);
    expect(alias.commands.find(item => item.name() === "analytics")?.options.length).toBeGreaterThan(0);
  });

  it("does not load Core for root help or unrelated production modules for writing help", () => {
    const probe = "data:text/javascript," + encodeURIComponent(
      'import {registerHooks} from "node:module"; import {writeSync} from "node:fs"; const urls=new Set(); registerHooks({load(url,context,next){urls.add(url);return next(url,context)}}); process.on("exit",()=>writeSync(1,"\\nTRACE "+JSON.stringify([...urls])));',
    );
    const run = (...args: string[]) => {
      const output = execFileSync(process.execPath, ["--import", probe, entry, ...args], { encoding: "utf8" });
      const marker = output.lastIndexOf("\nTRACE ");
      return { help: output.slice(0, marker), urls: JSON.parse(output.slice(marker + 7)) as string[] };
    };
    const root = run("--help");
    expect(root.help).toContain("Write chapters");
    expect(root.urls.some(url => url.includes("/packages/core/dist/"))).toBe(false);
    const write = run("--model", "fixture", "write", "next", "--help");
    expect(write.help).toContain("--count <n>");
    expect(write.urls.some(url => url.endsWith("/packages/core/dist/index.js"))).toBe(false);
    expect(write.urls.some(url => /\/packages\/core\/dist\/(?:play\/|interactive-film\/|pipeline\/(?:short-fiction-runner|script-storyboard-runner)\.js)/.test(url))).toBe(false);
  });
});
