import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const [repo, fixture] = process.argv.slice(2);
if (!repo || !fixture || !global.gc) throw new Error("Usage: node --expose-gc benchmarks/longform-memory-replay.mjs <repo> <chapter.md>");
const load = file => import(pathToFileURL(join(resolve(repo), "packages/core/dist", file)).href);
const { createInitialRuntimeState, saveRuntimeStateSnapshot, loadRuntimeStateSnapshot } = await load("state/runtime-state-store.js");
const { applyRuntimeStateDelta } = await load("state/state-reducer.js");
const { composeGovernedChapter } = await load("agents/composer.js");
const chapter = await readFile(fixture, "utf8");
const root = await mkdtemp(join(tmpdir(), "inkos-longform-replay-"));
const checkpoints = [];
try {
  let snapshot = await createInitialRuntimeState({ bookDir: root, language: "zh" });
  const story = join(root, "story");
  await mkdir(join(story, "roles", "major"), { recursive: true });
  await mkdir(join(story, "outline"), { recursive: true });
  await Promise.all([
    writeFile(join(story, "outline", "story_frame.md"), "# Story frame\n" + chapter),
    ...Array.from({ length: 32 }, (_, i) => writeFile(join(story, "roles", "major", i + ".md"), "Role " + i + "\n" + chapter)),
  ]);
  const book = { id: "fixture", title: "Ticket", genre: "suspense", platform: "other", status: "active",
    targetChapters: 60, chapterWordCount: 1000, language: "zh", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
  const started = performance.now();
  for (let number = 1; number <= 60; number++) {
    const goal = "Investigate the ticket " + number;
    const plan = { intent: { chapter: number, goal }, memo: { chapter: number, goal, body: goal, threadRefs: [] },
      runtimePath: "runtime/chapter-" + number + ".intent.md", plannerInputs: [] };
    const composed = await composeGovernedChapter({
      book, bookDir: root, chapterNumber: number, plan,
      outlineSectionSelector: async request => request.candidates.map(candidate => candidate.source),
      memorySemanticSelector: async request => request.candidates.slice(0, 8).map(candidate => candidate.id),
    });
    assert.equal(composed.contextPackage.chapter, number);
    snapshot = applyRuntimeStateDelta({
      snapshot, delta: { chapter: number,
        factOps: { upsert: [], expire: [] },
        hookOps: { upsert: [], mention: [], resolve: [], defer: [] }, newHookCandidates: [],
        chapterSummary: { chapter: number, title: goal, characters: "Zhou Yan", events: chapter,
          stateChanges: "Ticket retained", hookActivity: "", mood: "suspense", chapterType: "scene" } },
    });
    await saveRuntimeStateSnapshot(root, snapshot);
    if ([1, 10, 20, 40, 60].includes(number)) {
      global.gc();
      const usage = process.memoryUsage();
      checkpoints.push({ chapter: number, heapMiB: usage.heapUsed / 1048576, rssMiB: usage.rss / 1048576 });
    }
  }
  assert.equal((await loadRuntimeStateSnapshot(root)).chapterSummaries.rows.length, 60);
  console.log(JSON.stringify({ mode: "fixed selection + deterministic state replay", chapters: 60,
    roleCards: 32, elapsedMs: performance.now() - started, peakRssMiB: process.resourceUsage().maxRSS / 1024, checkpoints }, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}
