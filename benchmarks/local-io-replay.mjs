import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const [baseline, candidate, fixture] = process.argv.slice(2);
if (!baseline || !candidate || !fixture) throw new Error("Usage: node benchmarks/local-io-replay.mjs <baseline> <candidate> <chapter.md>");
const load = (repo, file) => import(pathToFileURL(join(resolve(repo), "packages/core/dist", file)).href);
const chapter = await readFile(fixture, "utf8");
const { FingerprintFileCache } = await load(candidate, "utils/fingerprint-file-cache.js");
const { splitMarkdownForSearch } = await load(candidate, "retrieval/local-search.js");
const commits = await Promise.all([baseline, candidate].map(repo => load(repo, "utils/atomic-file-set.js")));
const root = await mkdtemp(join(tmpdir(), "inkos-local-io-"));
const measure = async task => {
  const started = performance.now();
  await task();
  return performance.now() - started;
};
const order = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0];
try {
  const corpus = join(root, "corpus");
  await mkdir(corpus);
  const files = Array.from({ length: 128 }, (_, index) => join(corpus, index + ".md"));
  await Promise.all(files.map((file, index) => writeFile(file, "# Material " + index + "\n" + chapter)));
  const cache = new FingerprintFileCache(splitMarkdownForSearch);
  const read = async version => {
    const result = [];
    for (let i = 0; i < files.length; i += 16) {
      result.push(...await Promise.all(files.slice(i, i + 16).map(file =>
        version === 0 ? readFile(file, "utf8").then(splitMarkdownForSearch) : cache.read(file))));
    }
    return result;
  };
  const expected = await read(0);
  assert.deepEqual(await read(1), expected);
  const reads = [];
  for (const version of order) reads.push({ version, ms: await measure(() => read(version)) });
  const workDirs = [join(root, "v1"), join(root, "v2")];
  const commit = async (version, generation) => {
    const writes = Array.from({ length: 24 }, (_, index) => ({
      relativePath: "story/group-" + (index % 4) + "/artifact-" + index + ".md",
      content: String(generation) + "\n" + chapter,
    }));
    const ms = await measure(() => commits[version].commitAtomicFileSet({ rootDir: workDirs[version], writes }));
    for (const entry of writes) assert.equal(await readFile(join(workDirs[version], entry.relativePath), "utf8"), entry.content);
    return { version, ms };
  };
  await commit(0, 0);
  await commit(1, 0);
  const atomic = [];
  for (const [index, version] of order.entries()) atomic.push(await commit(version, index + 1));
  const median = values => {
    const ordered = values.slice().sort((a, b) => a - b);
    return (ordered[ordered.length / 2 - 1] + ordered[ordered.length / 2]) / 2;
  };
  const summarize = rows => [0, 1].map(version => ({
    version, medianMs: median(rows.filter(row => row.version === version).map(row => row.ms)),
  }));
  console.log(JSON.stringify({ corpusFiles: files.length, commitFiles: 24, reads, atomic,
    readMedians: summarize(reads), atomicMedians: summarize(atomic) }, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}
