import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {performance} from "node:perf_hooks";

const count=48, sessionId="active-tool-loop";
if(process.argv[2]==="worker"){
  const [, , ,root,baseUrl,scope]=process.argv;
  const {runAgentSession,evictAgentCache}=await import("../packages/core/dist/agent/agent-session.js");
  const {readTranscriptEvents}=await import("../packages/core/dist/interaction/session-transcript.js");
  const model={id:"fixture",name:"fixture",api:"openai-completions",provider:"openai",baseUrl,reasoning:false,input:["text"],
    cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:262144,maxTokens:1024};
  let liveResultBytes=0,liveMessages=0,liveHeapMiB=0,liveRssMiB=0;
  const started=performance.now();
  const result=await runAgentSession({projectRoot:root,sessionId,bookId:null,workId:null,profileId:"workspace-default",
    sessionKind:"chat",language:"zh",model,apiKey:"fixture",stream:false,historyScope:scope,pipeline:{},
    onEvent:event=>{
      if(event.type!=="agent_end")return;
      const reads=event.messages.filter(m=>m.role==="toolResult"&&["workspace__read","read_archived_tool_result"].includes(m.toolName));
      liveMessages=reads.length;
      liveResultBytes=Buffer.byteLength(JSON.stringify(reads));
      global.gc?.();
      const mem=process.memoryUsage();
      liveHeapMiB=mem.heapUsed/1048576;liveRssMiB=mem.rss/1048576;
    }},
    "Read evidence.txt, then retrieve archive pages; report only after all "+count+" reads.");
  assert.equal(result.errorMessage,undefined);
  assert.equal(result.responseText,"All reads completed.");
  assert.equal(liveMessages,count);
  const elapsedMs=performance.now()-started;
  const events=await readTranscriptEvents(root,sessionId);
  const raw=events.filter(e=>e.type==="message"&&e.role==="toolResult"&&["workspace__read","read_archived_tool_result"].includes(e.message.toolName)).map(e=>e.message);
  assert.equal(raw.length,count);
  assert.equal(events.filter(e=>e.type==="request_committed").length,1);
  const diskResultBytes=Buffer.byteLength(JSON.stringify(raw));
  assert.ok(raw.every(m=>m.content[0].type==="text"&&("preview" in JSON.parse(m.content[0].text)||"text" in JSON.parse(m.content[0].text))));
  assert.ok(scope==="window"?liveResultBytes<diskResultBytes/2:liveResultBytes===diskResultBytes);
  const output={scope,elapsedMs,liveMessages,liveResultBytes,diskResultBytes,liveHeapMiB,liveRssMiB,peakRssMiB:process.resourceUsage().maxRSS/1024};
  evictAgentCache(sessionId);
  console.log(JSON.stringify(output));
}else{
  const root=await mkdtemp(join(tmpdir(),"inkos-loop-replay-"));
  let requests=0,mainCalls=0,summaryCalls=0,summaryBytes=0,requestBytes=0,archiveId="";
  const server=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const raw=Buffer.concat(chunks),body=JSON.parse(raw.toString("utf8"));requests++;requestBytes+=raw.length;
    if(requests>count+20){res.writeHead(400);res.end("Fixture request limit exceeded");return;}
    let message,finishReason="tool_calls";
    if(body.tool_choice==="none"){
      summaryCalls++;summaryBytes+=raw.length;finishReason="stop";message={content:"Recorded reads; exact bytes are available in the session archive."};
    }else{
      mainCalls++;
      if(mainCalls===2){
        const latest=body.messages.find(m=>m.role==="tool"&&m.tool_call_id==="call-1");
        archiveId=JSON.parse(latest.content).archivedResult.id;
      }
      const name=mainCalls>count?"finish_turn":mainCalls%2?"workspace__read":"read_archived_tool_result";
      const args=name==="finish_turn"?{status:"answered",message:"All reads completed."}:name==="workspace__read"?{path:"evidence.txt"}:{id:archiveId,offset:0};
      message={tool_calls:[{id:"call-"+mainCalls,type:"function",function:{name,arguments:JSON.stringify(args)}}]};
    }
    res.writeHead(200,{"Content-Type":"application/json"});
    res.end(JSON.stringify({id:"fixture-"+requests,object:"chat.completion",choices:[{index:0,finish_reason:finishReason,message}]}));
  });
  server.listen(0,"127.0.0.1");await once(server,"listening");
  const url="http://127.0.0.1:"+server.address().port+"/v1";
  try{
    const samples=[];
    for(const scope of ["full","window","window","full"]){
      requests=mainCalls=summaryCalls=summaryBytes=requestBytes=0;archiveId="";
      const dir=join(root,"run-"+samples.length);await mkdir(dir,{recursive:true});
      await writeFile(join(dir,"evidence.txt"),"证据：完整正文与记录。".repeat(4000));
      const child=spawn(process.execPath,["--expose-gc",fileURLToPath(import.meta.url),"worker",dir,url,scope],{stdio:["ignore","pipe","pipe"]});
      let stdout="",stderr="";child.stdout.on("data",b=>stdout+=b);child.stderr.on("data",b=>stderr+=b);
      const [code]=await once(child,"close");assert.equal(code,0,stderr+"\n"+stdout);
      assert.equal(mainCalls,count+1);
      samples.push({...JSON.parse(stdout.trim()),requests,summaryCalls,summaryBytes,requestBytes});
    }
    assert.equal(samples[0].diskResultBytes,samples[1].diskResultBytes);
    console.log(JSON.stringify(samples,null,2));
  }finally{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});
  }
}
