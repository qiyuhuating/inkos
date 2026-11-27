import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const [baseline, candidate, fixture] = process.argv.slice(2);
if (!baseline || !candidate || !fixture) {
  throw new Error("Usage: node benchmarks/compose-replay.mjs <baseline-repo> <candidate-repo> <chapter.md>");
}
const load = (repo, file) => import(pathToFileURL(join(resolve(repo), "packages/core/dist", file)).href);
const chapter = await readFile(fixture, "utf8");
const [before, after, { createInitialRuntimeState }] = await Promise.all([
  load(baseline, "agents/composer.js"),
  load(candidate, "agents/composer.js"),
  load(baseline, "state/runtime-state-store.js"),
]);
const root = await mkdtemp(join(tmpdir(), "inkos-compose-benchmark-"));
try {
  await createInitialRuntimeState({ bookDir: root, language: "zh" });
  const story = join(root, "story");
  await Promise.all([
    mkdir(join(story, "outline"), { recursive: true }),
    mkdir(join(story, "roles", "major"), { recursive: true }),
    mkdir(join(story, "roles", "minor"), { recursive: true }),
  ]);
  await Promise.all([
    ...["current_focus.md", "author_intent.md", "style_guide.md", "parent_canon.md", "fanfic_canon.md"]
      .map((file) => writeFile(join(story, file), chapter)),
    writeFile(join(story, "outline", "story_frame.md"), "# Story frame\n" + chapter),
    writeFile(join(story, "outline", "volume_map.md"), "# Volume 1\n" + chapter),
    ...Array.from({ length: 128 }, (_, i) => writeFile(
      join(story, "roles", i < 64 ? "major" : "minor", String(i).padStart(3, "0") + ".md"),
      "Role " + i + "\n" + chapter,
    )),
  ]);
  const goal = "Investigate the ticket";
  const plan = {
    intent: { chapter: 1, goal },
    memo: { chapter: 1, goal, body: goal, threadRefs: [] },
    runtimePath: "runtime/chapter-1.intent.md",
    plannerInputs: [],
  };
  const book = {
    id: "fixture", title: "Ticket", genre: "suspense", platform: "other", status: "active",
    targetChapters: 3, chapterWordCount: 1000, language: "zh",
    createdAt: "2026-01-01", updatedAt: "2026-01-01",
  };
  const input = {
    book, bookDir: root, chapterNumber: 1, plan,
    outlineSectionSelector: async (request) => request.candidates.map((c) => c.source),
    memorySemanticSelector: async (request) => request.candidates.map((c) => c.id),
  };
  const modules = [before, after];
  let canonical;
  const run = async (version) => {
    const started = performance.now();
    const result = await modules[version].composeGovernedChapter(input);
    const elapsed = performance.now() - started;
    const signature = JSON.stringify(result.contextPackage);
    if (canonical === undefined) canonical = signature;
    else assert.equal(signature, canonical);
    return { version: version === 0 ? "v1" : "v2", elapsedMs: elapsed, entries: result.contextPackage.selectedContext.length };
  };
  await run(0);
  await run(1);
  const samples = [];
  for (const version of [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0]) samples.push(await run(version));
  console.log(JSON.stringify({ mode: "fixed-selection replay", roleCards: 128, samples }, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}
