import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const [baseline, candidate] = process.argv.slice(2);
if (!baseline || !candidate) throw new Error("Usage: node benchmarks/cli-startup-replay.mjs <baseline-repo> <candidate-repo>");
const repos = [baseline, candidate].map(path => resolve(path));
const probe = "data:text/javascript," + encodeURIComponent(
  'import {registerHooks} from "node:module"; import {writeSync} from "node:fs"; const urls=new Set(); registerHooks({load(url,context,next){urls.add(url);return next(url,context)}}); process.on("exit",()=>{const core=[...urls].filter(url=>url.includes("/packages/core/dist/")); const unrelated=core.filter(url=>/\\/packages\\/core\\/dist\\/(?:play\\/|interactive-film\\/|pipeline\\/(?:short-fiction-runner|script-storyboard-runner)\\.js)/.test(url)); writeSync(2,"\\nINKOS_TRACE "+JSON.stringify({modules:urls.size,coreModules:core.length,unrelatedModules:unrelated.length,peakRssMiB:process.resourceUsage().maxRSS/1024})+"\\n")});',
);
const order = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0];
const median = values => {
  const sorted = values.slice().sort((a, b) => a - b);
  return (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
};
const results = [];
for (const args of [["--help"], ["write", "next", "--help"], ["status", "--help"]]) {
  const samples = [];
  for (const version of order) {
    const root = repos[version];
    const start = performance.now();
    const child = spawnSync(process.execPath, ["--import", probe, join(root, "packages/cli/dist/index.js"), ...args], {
      cwd: root, encoding: "utf8", timeout: 15000,
    });
    const elapsedMs = performance.now() - start;
    assert.equal(child.status, 0, child.stderr);
    const trace = child.stderr.split(/\r?\n/).find(line => line.startsWith("INKOS_TRACE "));
    assert.ok(trace, "Missing module trace");
    assert.match(child.stdout, /Usage: inkos/);
    samples.push({ version, elapsedMs, ...JSON.parse(trace.slice(12)) });
  }
  results.push({
    command: args.join(" "), samples,
    medians: [0, 1].map(version => {
      const rows = samples.filter(row => row.version === version);
      return { version, ...Object.fromEntries(["elapsedMs", "peakRssMiB", "modules", "coreModules", "unrelatedModules"]
        .map(key => [key, median(rows.map(row => row[key]))])) };
    }),
  });
}
console.log(JSON.stringify(results, null, 2));
