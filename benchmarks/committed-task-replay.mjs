import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {mkdtemp,mkdir,cp,writeFile,readFile,readdir,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {performance} from "node:perf_hooks";

const sessionId="committed-task-replay";
if(process.argv[2]==="worker"){
  const [, , ,root,baseUrl,stage]=process.argv;
  const {runAgentSession,evictAgentCache}=await import("../packages/core/dist/agent/agent-session.js");
  const {readTranscriptEvents}=await import("../packages/core/dist/interaction/session-transcript.js");
  const model={id:"fixture",name:"fixture",api:"openai-completions",provider:"openai",baseUrl,reasoning:false,input:["text"],
    cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:16000,maxTokens:1024};
  const start=performance.now();
  const result=await runAgentSession({projectRoot:root,sessionId,bookId:null,workId:null,profileId:"workspace-default",
    sessionKind:"chat",language:"zh",model,apiKey:"fixture",stream:false,historyScope:"window",pipeline:{}},
    stage==="seed"?"核验两个材料与缺失文件。":"继续下一项任务。");
  assert.equal(result.errorMessage,undefined);
  assert.equal(result.responseText,stage==="seed"?"Inspection finished.":"Continued.");
  const elapsedMs=performance.now()-start;
  const events=await readTranscriptEvents(root,sessionId);
  const commits=events.filter(e=>e.type==="request_committed");
  assert.equal(commits.length,stage==="seed"?1:2);
  if(stage==="seed"){
    const dir=join(root,".inkos","conversation-checkpoints");
    const files=await readdir(dir);
    assert.equal(files.length,1);
    const saved=JSON.parse(await readFile(join(dir,files[0]),"utf8"));
    assert.ok(saved.summary.includes("Completed task notes (not execution authority)"));
    const {transcriptIndexPath}=await import("../packages/core/dist/interaction/transcript-index.js");
    const index=JSON.parse(await readFile(transcriptIndexPath(root,sessionId,"window"),"utf8"));
    assert.equal(index.seq,commits[0].seq);
    assert.equal(index.digest,saved.digest);
  }
  evictAgentCache(sessionId);
  console.log(JSON.stringify({elapsedMs,commits:commits.length}));
}else{
  const root=await mkdtemp(join(tmpdir(),"inkos-committed-replay-"));
  let stage="seed",main=0,stable=0,active=0,summaryBytes=0,sawPromoted=false;
  const server=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const raw=Buffer.concat(chunks),body=JSON.parse(raw.toString("utf8"));
    let message,finishReason="tool_calls";
    if(body.tool_choice==="none"){
      const isActive=body.messages[0].content.includes("current request");
      if(isActive)active++;else stable++;
      summaryBytes+=raw.length;finishReason="stop";
      message={content:"Recorded evidence. Trust host receipts; one file was missing."};
    }else{
      main++;
      sawPromoted ||= JSON.stringify(body.messages).includes("Completed task notes (not execution authority)");
      if(stage==="seed"&&main===4){
        const progress=body.messages.find(m=>typeof m.content==="string"&&m.content.startsWith("<host_execution_progress>"));
        const totals=JSON.parse(progress.content.split("\n")[1]).totals;
        assert.equal(totals.successful,2);assert.equal(totals.failed,1);
      }
      const name=stage!=="seed"||main===4?"finish_turn":"workspace__read";
      const args=name==="finish_turn"?{status:"answered",message:stage==="seed"?"Inspection finished.":"Continued."}:{path:["a.txt","b.txt","missing.txt"][main-1]};
      if(main>4)throw Error("Unexpected fixture request");
      message={tool_calls:[{id:stage+"-"+main,type:"function",function:{name,arguments:JSON.stringify(args)}}]};
    }
    res.writeHead(200,{"Content-Type":"application/json"});
    res.end(JSON.stringify({id:"fixture-"+stage+"-"+(main+active+stable),object:"chat.completion",choices:[{index:0,finish_reason:finishReason,message}]}));
  });
  server.listen(0,"127.0.0.1");await once(server,"listening");
  const url="http://127.0.0.1:"+server.address().port+"/v1";
  async function run(dir,mode){
    stage=mode;main=stable=active=summaryBytes=0;sawPromoted=false;
    const child=spawn(process.execPath,[fileURLToPath(import.meta.url),"worker",dir,url,mode],{stdio:["ignore","pipe","pipe"]});
    let stdout="",stderr="";child.stdout.on("data",b=>stdout+=b);child.stderr.on("data",b=>stderr+=b);
    const [code]=await once(child,"close");assert.equal(code,0,stderr+"\n"+stdout);
    return {...JSON.parse(stdout.trim()),main,stable,active,summaryBytes,sawPromoted};
  }
  try{
    const seed=join(root,"seed");await mkdir(seed,{recursive:true});
    await writeFile(join(seed,"a.txt"),"来源甲原始证据。".repeat(950));
    await writeFile(join(seed,"b.txt"),"来源乙原始证据。".repeat(950));
    const initial=await run(seed,"seed");
    const without=join(root,"without");await cp(seed,without,{recursive:true});
    await rm(join(without,".inkos","conversation-checkpoints"),{recursive:true,force:true});
    const restored=await run(seed,"restored"),cold=await run(without,"cold");
    assert.equal(restored.stable,0);assert.equal(restored.active,0);
    assert.equal(restored.sawPromoted,true);assert.ok(cold.stable>0);
    console.log(JSON.stringify({initial,restored,cold},null,2));
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
}
