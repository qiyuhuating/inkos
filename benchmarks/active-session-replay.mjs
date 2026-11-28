import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm, writeFile, cp, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { performance } from "node:perf_hooks";

const sessionId="active-session-replay";
const bodyText="证据：完整正文与记录。".repeat(4000);
const promptText="核验已有记录，保留证据与进度。".repeat(90);

async function worker(root,baseUrl,start,count,historyScope="window") {
  const {transcriptIndexPath}=await import("../packages/core/dist/interaction/transcript-index.js");
  const target=join(root,".inkos","sessions",sessionId+".jsonl");
  let initialIndex;
  try{initialIndex=JSON.parse(await fsp.readFile(transcriptIndexPath(root,sessionId,"window"),"utf8"));}catch(error){if(error.code!=="ENOENT")throw error;}
  const hasCheckpoint=await fsp.readdir(join(root,".inkos","conversation-checkpoints")).then(files=>files.length>0,error=>{if(error.code==="ENOENT")return false;throw error;});
  const reads={full:0,ranges:[]};
  const originalReadFile=fsp.readFile,originalStream=fs.createReadStream;
  fsp.readFile=function(path,...args){if(String(path)===target)reads.full++;return originalReadFile(path,...args);};
  fs.createReadStream=function(path,options){if(String(path)===target)reads.ranges.push({start:options?.start??0,end:options?.end??null});return originalStream(path,options);};
  syncBuiltinESMExports();
  const {runAgentSession,evictAgentCache}=await import("../packages/core/dist/agent/agent-session.js");
  const {readTranscriptEvents}=await import("../packages/core/dist/interaction/session-transcript.js");
  const model={id:"fixture-model",name:"fixture-model",api:"openai-completions",provider:"openai",
    baseUrl,reasoning:false,input:["text"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:16000,maxTokens:1024};
  const samples=[],began=performance.now();
  let recoveryTrace;
  for(let turn=start;turn<start+count;turn++){
    const result=await runAgentSession({projectRoot:root,sessionId,bookId:null,workId:null,
      profileId:"workspace-default",sessionKind:"chat",language:"zh",model,apiKey:"fixture",stream:false,...(historyScope==="window"?{historyScope}:{}),pipeline:{}},
      "Turn "+turn+": Read evidence.txt. "+promptText);
    if(turn===start){
      recoveryTrace={fullReads:reads.full,ranges:reads.ranges.slice(),initialPrefixOffset:initialIndex?.byteOffset??0};
      if(start>1&&hasCheckpoint&&historyScope==="window"){
        assert.ok(initialIndex?.byteOffset>0,"Missing certified recovery index");
        assert.equal(recoveryTrace.fullReads,0,"Indexed Agent materialized the full log");
        assert.ok(recoveryTrace.ranges.length>0&&recoveryTrace.ranges.every(range=>range.start>=initialIndex.byteOffset),"Indexed Agent scanned the compacted prefix");
      }
    }
    assert.equal(result.responseText,"Fixture read completed.", JSON.stringify({turn,error:result.errorMessage,responseText:result.responseText,last:result.messages?.slice(-2).map(m=>({role:m.role,stopReason:m.stopReason,errorMessage:m.errorMessage,content:m.role==="assistant"?m.content:undefined}))}));
    if(turn===start||turn===start+count-1||turn%10===0){
      global.gc?.();
      const memory=process.memoryUsage();
      samples.push({turn,heapMiB:memory.heapUsed/1048576,rssMiB:memory.rss/1048576,windowMessages:result.messages.length,compacted:result.compactedHistoryCount??0});
    }
  }
  const events=await readTranscriptEvents(root,sessionId);
  assert.equal(events.filter(event=>event.type==="request_committed").length,start+count-1);
  const diskMessages=events.filter(event=>event.type==="message").length;
  if(historyScope==="window"){
    assert.ok(samples.at(-1).compacted>0, "No physical history released");
    assert.ok(samples.at(-1).windowMessages<diskMessages, "Full disk history is still retained");
  }else{
    const {restoreAgentMessagesFromTranscript}=await import("../packages/core/dist/interaction/session-transcript-restore.js");
    const restored=await restoreAgentMessagesFromTranscript(root,sessionId,"chat");
    assert.equal(samples.at(-1).windowMessages,restored.length,"Full-history API diverged from canonical restore");
    assert.equal(restored.filter(message=>message.role==="user").length,start+count-1);
    assert.ok(JSON.stringify(restored[0]).includes("Turn 1:"));
  }
  const checkpointFiles=await readdir(join(root,".inkos","conversation-checkpoints"));
  assert.equal(checkpointFiles.length,1);
  const archiveFiles=await readdir(join(root,".inkos","tool-results",(await import("node:crypto")).createHash("sha256").update(sessionId).digest("hex")));
  const finalIndex=JSON.parse(await fsp.readFile(transcriptIndexPath(root,sessionId,"window"),"utf8"));
  const logBytes=(await fsp.stat(target)).size;
  assert.ok(finalIndex.byteOffset>0&&finalIndex.byteOffset<=logBytes);
  const output={turns:count,commits:start+count-1,elapsedMs:performance.now()-began,peakRssMiB:process.resourceUsage().maxRSS/1024,samples,diskMessages,archiveFiles:archiveFiles.length,recoveryTrace,logBytes,prefixOffset:finalIndex.byteOffset};
  evictAgentCache(sessionId);
  console.log(JSON.stringify(output));
}

if(process.argv[2]==="worker"){
  await worker(process.argv[3],process.argv[4],Number(process.argv[5]),Number(process.argv[6]),process.argv[7]);
}else{
  const root=await mkdtemp(join(tmpdir(),"inkos-active-session-"));
  let requests=[];
  const server=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const raw=Buffer.concat(chunks),body=JSON.parse(raw.toString("utf8"));
    const compaction=body.tool_choice==="none";
    requests.push({compaction,bytes:raw.length,maxTokens:body.max_tokens??body.max_completion_tokens});
    if(requests.length>600){res.writeHead(400);res.end("Fixture request limit exceeded");return;}
    const last=body.messages.at(-1);
    const progress=body.messages.some(message=>{
      const content=typeof message.content==="string"?message.content:"";
      const match=/<host_execution_progress>\n([\s\S]*?)\n<\/host_execution_progress>/.exec(content);
      if(!match)return false;
      return JSON.parse(match[1]).recent.some(entry=>entry.tool==="workspace__read"&&entry.status==="success");
    });
    let message;
    if(compaction)message={content:"Fixture notes: prior reads returned archived evidence. No mutation performed."};
    else{
      const name=last.role==="tool"||progress?"finish_turn":"workspace__read";
      const args=name==="finish_turn"?{status:"answered",message:"Fixture read completed."}:{path:"evidence.txt"};
      message={tool_calls:[{id:"call-"+requests.length,type:"function",function:{name,arguments:JSON.stringify(args)}}]};
    }
    res.writeHead(200,{"Content-Type":"application/json"});
    res.end(JSON.stringify({id:"fixture-"+requests.length,object:"chat.completion",choices:[{index:0,finish_reason:compaction?"stop":"tool_calls",message}]}));
  });
  server.listen(0,"127.0.0.1");await once(server,"listening");
  const baseUrl="http://127.0.0.1:"+server.address().port+"/v1";
  async function run(dir,start,count,scope="window"){
    requests=[];
    const child=spawn(process.execPath,["--expose-gc",fileURLToPath(import.meta.url),"worker",dir,baseUrl,String(start),String(count),scope],{stdio:["ignore","pipe","pipe"]});
    let stdout="",stderr="";
    child.stdout.on("data",b=>stdout+=b);
    child.stderr.on("data",b=>stderr+=b);
    const [code]=await once(child,"close");
    if(code!==0)throw new Error("Worker failed: "+stderr+"\n"+stdout);
    return {...JSON.parse(stdout.trim()),modelRequests:requests.length,compactionRequests:requests.filter(r=>r.compaction).length,
      compactionBytes:requests.filter(r=>r.compaction).reduce((n,r)=>n+r.bytes,0),
      maxRequestBytes:Math.max(...requests.map(r=>r.bytes))};
  }
  try{
    const seeded=join(root,"seed");
    await (await import("node:fs/promises")).mkdir(seeded,{recursive:true});
    await writeFile(join(seeded,"evidence.txt"),bodyText);
    const active=await run(seeded,1,40);
    const without=join(root,"without-checkpoint");
    await cp(seeded,without,{recursive:true});
    await rm(join(without,".inkos","conversation-checkpoints"),{recursive:true,force:true});
    const resumed=await run(seeded,41,1);
    const cold=await run(without,41,1);
    assert.equal(active.commits,40);
    assert.equal(resumed.commits,cold.commits);
    assert.ok(resumed.compactionRequests<cold.compactionRequests, "Checkpoint did not reduce semantic compaction requests.");
    const fullCompatibility=await run(seeded,42,1,"full");
    console.log(JSON.stringify({active,resumed,cold,fullCompatibility},null,2));
  }finally{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    await rm(root,{recursive:true,force:true});
  }
}
