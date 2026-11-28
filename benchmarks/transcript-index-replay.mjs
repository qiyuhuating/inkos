import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { appendTranscriptSequenceEvents,readTranscriptRevision } from "../packages/core/dist/interaction/session-transcript.js";
import { restoreAgentMessagesFromEvents,adaptRestoredAgentMessagesForModel } from "../packages/core/dist/interaction/session-transcript-restore.js";
import { restoreIndexedConversation } from "../packages/core/dist/interaction/transcript-recovery-index.js";
import { transcriptIndexPath } from "../packages/core/dist/interaction/transcript-index.js";
import { digestConversationMessages } from "../packages/core/dist/harness/agent-context.js";

const sessionId="scaling-replay";
const model={id:"fixture",api:"openai-completions",provider:"openai"};
function request(seq,text){
  const base={version:1,sessionId,timestamp:seq,requestId:"request-"+String(seq).padStart(8,"0")};
  return [
    {...base,type:"request_started",seq,sessionKind:"chat",input:text},
    {...base,type:"message",seq:seq+1,uuid:"user-"+seq,parentUuid:null,role:"user",message:{role:"user",content:text,timestamp:seq}},
    {...base,type:"message",seq:seq+2,uuid:"assistant-"+seq,parentUuid:"user-"+seq,role:"assistant",
      message:{role:"assistant",content:[{type:"text",text:"Recorded."}],timestamp:seq,api:model.api,provider:model.provider,model:model.id}},
    {...base,type:"request_committed",seq:seq+3},
  ];
}
function project(events){return adaptRestoredAgentMessagesForModel(restoreAgentMessagesFromEvents(events,"chat"),model,true);}
function options(root,revision,count,digest){
  return {root,sessionId,sessionKind:"chat",identity:"fixture",model,canReadArchives:true,revision,
    checkpoint:{count,digest,summary:"Verified prior notes."}};
}
if(process.argv[2]==="worker"){
  const [, , ,root,count,digest]=process.argv;
  const start=performance.now();
  const revision=await readTranscriptRevision(root,sessionId);
  const result=await restoreIndexedConversation(options(root,revision,Number(count),digest));
  assert.ok(result);
  assert.equal(result.messages.length,2);
  assert.equal(result.messages[0].content,"Recent evidence.");
  console.log(JSON.stringify({elapsedMs:performance.now()-start,scannedBytes:result.scannedBytes,
    fullBytes:revision.byteLength,indexed:result.usedIndex,peakRssMiB:process.resourceUsage().maxRSS/1024}));
}else{
  const results=[];
  for(const size of [128,4096]){
    const root=await mkdtemp(join(tmpdir(),"inkos-log-scaling-"));
    try{
      const events=[];
      let digest,count=0;
      for(let i=0;i<size;i++){
        const batch=request(i*4+1,"历史记录 Evidence 中文📚\n".repeat(64));
        const messages=project(batch);
        digest=digestConversationMessages(messages,digest);count+=messages.length;
        events.push(...batch);
      }
      events.push(...request(size*4+1,"Recent evidence."));
      await appendTranscriptSequenceEvents(root,sessionId,()=>events);
      const samples=[];
      for(const indexed of [false,true,true,false,false,true]){
        if(!indexed)await rm(transcriptIndexPath(root,sessionId,"window"),{force:true});
        const child=spawn(process.execPath,[fileURLToPath(import.meta.url),"worker",root,String(count),digest],{stdio:["ignore","pipe","pipe"]});
        let stdout="",stderr="";
        child.stdout.on("data",chunk=>stdout+=chunk);
        child.stderr.on("data",chunk=>stderr+=chunk);
        const [code]=await once(child,"close");
        assert.equal(code,0,stderr);
        const sample=JSON.parse(stdout.trim());
        assert.equal(sample.indexed,indexed);
        samples.push(sample);
      }
      const median=values=>values.sort((a,b)=>a-b)[1];
      const row={requests:size+1,fullBytes:samples[0].fullBytes,
        streamingBytes:samples.find(s=>!s.indexed).scannedBytes,indexedBytes:samples.find(s=>s.indexed).scannedBytes,
        streamingMs:median(samples.filter(s=>!s.indexed).map(s=>s.elapsedMs)),
        indexedMs:median(samples.filter(s=>s.indexed).map(s=>s.elapsedMs)),
        streamingPeakRssMiB:median(samples.filter(s=>!s.indexed).map(s=>s.peakRssMiB)),
        indexedPeakRssMiB:median(samples.filter(s=>s.indexed).map(s=>s.peakRssMiB)),samples};
      assert.ok(row.indexedBytes<2048);
      results.push(row);
    }finally{await rm(root,{recursive:true,force:true});}
  }
  console.log(JSON.stringify(results,null,2));
}
