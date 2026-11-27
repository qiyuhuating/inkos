import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createHarnessContextTransform } from "../packages/core/dist/harness/agent-context.js";
import { createBuiltInWorkProfileRegistry } from "../packages/core/dist/harness/builtin-profiles.js";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ToolResultArchive } from "../packages/core/dist/agent/tool-result-archive.js";

const fixture=process.argv[2];
if(!fixture)throw new Error("Usage: node benchmarks/context-metrics-replay.mjs <chapter.md>");
const text=await readFile(fixture,"utf8");
const profile=createBuiltInWorkProfileRegistry().require("workspace-default");
const history=Array.from({length:240},(_,i)=>i%2===0
  ? {role:"user",content:"Record "+i+"\n"+text.repeat(4),timestamp:i}
  : {role:"assistant",content:[{type:"text",text:text.repeat(4)}],timestamp:i});
const iterations=20,order=[0,1,1,0,0,1,1,0,0,1,1,0];
let expected;
const samples=[];
for(const version of order){
  let compactions=0;
  const transform=createHarnessContextTransform({projectRoot:tmpdir(),work:null,profile,budgetTokens:8000,
    immutableCompletedMessages:version===1,conversationCompactor:async()=>{compactions++;return "Fixture summary.";}});
  const warm=await transform([...history,{role:"user",content:"Continue.",timestamp:1000}]);
  const projection=JSON.stringify(warm.map(m=>({role:m.role,content:m.content})));
  if(expected===undefined)expected=projection;
  assert.equal(projection,expected);
  const start=performance.now();
  for(let i=0;i<iterations;i++){
    const projected=await transform([...history,{role:"user",content:"Continue.",timestamp:1001+i}]);
    assert.equal(JSON.stringify(projected.map(m=>({role:m.role,content:m.content}))),expected);
  }
  samples.push({version,elapsedMs:performance.now()-start,compactions});
  assert.equal(compactions,1);
}
const median=values=>{const sorted=values.slice().sort((a,b)=>a-b);return (sorted[2]+sorted[3])/2;};
const root=await mkdtemp(join(tmpdir(),"inkos-context-archive-replay-"));
try{
  const archive=new ToolResultArchive(root,"fixture");
  const content=text.repeat(100);
  const original={content:[{type:"text",text:content}],details:{displayText:content,hostExecution:{risk:"read",status:"success",artifacts:[]}}};
  const projected=await archive.project(original);
  const ref=projected.details.archivedResult;
  let recovered="",offset=0;
  while(offset!==null){const page=await archive.read(ref.id,offset);recovered+=page.text;offset=page.nextOffset;}
  assert.equal(recovered,content);
  console.log(JSON.stringify({historyMessages:history.length,iterations,historyBytes:Buffer.byteLength(JSON.stringify(history)),
    samples,medians:[0,1].map(version=>({version,elapsedMs:median(samples.filter(s=>s.version===version).map(s=>s.elapsedMs))})),
    archive:{originalBytes:Buffer.byteLength(JSON.stringify(original)),projectedBytes:Buffer.byteLength(JSON.stringify(projected)),contentBytes:ref.bytes}},null,2));
}finally{await rm(root,{recursive:true,force:true});}
