import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const [baseline, candidate, fixture] = process.argv.slice(2);
if (!baseline || !candidate || !fixture) throw new Error("Usage: node benchmarks/session-transcript-replay.mjs <baseline> <candidate> <chapter.md>");
const modules = await Promise.all([baseline, candidate].map(repo => import(pathToFileURL(join(resolve(repo), "packages/core/dist/interaction/session-transcript.js")).href)));
const text = await readFile(fixture, "utf8");
const seedCount = 1000, appendedCount = 100, sessionId = "replay";
const event = seq => ({ type:"request_started", version:1, sessionId, seq, timestamp:seq, requestId:"r"+seq, input:text });
const initial = Array.from({length:seedCount},(_,i)=>JSON.stringify(event(i+1))).join("\n")+"\n";
const root = await mkdtemp(join(tmpdir(),"inkos-transcript-replay-"));
const samples = [];
try {
  const order = [0,1,1,0,0,1,1,0,0,1,1,0];
  for (const [trial, version] of order.entries()) {
    const dir = join(root, String(trial));
    const lib = modules[version];
    await mkdir(lib.sessionsDir(dir), { recursive:true });
    await writeFile(lib.transcriptPath(dir,sessionId), initial);
    const append = version === 0 ? lib.appendTranscriptEvents : lib.appendTranscriptSequenceEvents;
    const started = performance.now();
    for (let i = 0; i < appendedCount; i++) {
      await append(dir,sessionId,({nextSeq})=>[event(nextSeq)]);
    }
    const elapsedMs = performance.now()-started;
    const events = await lib.readTranscriptEvents(dir,sessionId);
    assert.deepEqual(events,Array.from({length:seedCount+appendedCount},(_,i)=>event(i+1)));
    samples.push({ version, elapsedMs });
  }
  const median = array => {
    const sorted=array.slice().sort((a,b)=>a-b);
    return (sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;
  };
  console.log(JSON.stringify({ seedCount, appendedCount, initialBytes:Buffer.byteLength(initial), samples,
    medians:[0,1].map(version=>({version,elapsedMs:median(samples.filter(s=>s.version===version).map(s=>s.elapsedMs))})) },null,2));
} finally {
  await rm(root,{recursive:true,force:true});
}
