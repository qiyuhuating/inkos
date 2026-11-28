import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {performance} from "node:perf_hooks";
import {createHarnessContextTransform} from "../packages/core/dist/harness/agent-context.js";
import {createBuiltInWorkProfileRegistry} from "../packages/core/dist/harness/builtin-profiles.js";
import {ConversationCheckpointStore} from "../packages/core/dist/harness/conversation-checkpoint.js";

const revision="4d68a23f";
const repo=fileURLToPath(new URL("../",import.meta.url));
const require=createRequire(new URL("../packages/core/package.json",import.meta.url));
const ts=require("typescript");
const baselinePath=join(repo,"packages/core/dist/harness/.summary-baseline-"+process.pid+".mjs");
const source=execFileSync("git",["show",revision+":packages/core/src/harness/agent-context.ts"],{cwd:repo,encoding:"utf8"});
await writeFile(baselinePath,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,{flag:"wx"});
const root=await mkdtemp(join(tmpdir(),"inkos-summary-replay-"));
function exchange(id,text,isError=false){
  return [{role:"assistant",timestamp:3,content:[{type:"toolCall",id,name:"workspace__read",arguments:{path:id+".txt"}}]},
    {role:"toolResult",timestamp:4,toolCallId:id,toolName:"workspace__read",isError,content:[{type:"text",text}]}];
}
async function replay(factory,mode,trial){
  let calls=[],messages=[{role:"user",content:"Durable constraint OLD-HISTORY. ".repeat(500),timestamp:1}];
  const transform=factory({projectRoot:root,work:null,profile:createBuiltInWorkProfileRegistry().require("workspace-default"),
    budgetTokens:1800,immutableCompletedMessages:true,checkpoint:new ConversationCheckpointStore(root,mode+trial,"fixture"),
    conversationCompactor:async request=>{calls.push({scope:request.scope??"combined",bytes:Buffer.byteLength(request.history),old:request.history.includes("OLD-HISTORY"),priorRaw:/SOURCE-[0-9]+-[AB]/.test(request.history)});
      return "Fixture notes: retain constraints and source references.";}});
  const start=performance.now();
  for(let i=0;i<8;i++){
    transform.beginRequest?.();
    messages.push({role:"user",content:"Inspect sources for request "+i,timestamp:10+i});
    await transform(messages);
    messages.push(...exchange("read-"+i+"-a",("SOURCE-"+i+"-A. ").repeat(1200)));
    await transform(messages);
    messages.push(...exchange("failed-"+i,"ENOENT",true));
    const receipt=await transform(messages);
    const progress=receipt.find(m=>m.role==="user"&&typeof m.content==="string"&&m.content.startsWith("<host_execution_progress>"));
    assert.deepEqual(JSON.parse(progress.content.split("\n")[1]).totals,{successful:1,failed:1,uniqueReadPaths:1});
    messages.push(...exchange("read-"+i+"-b",("SOURCE-"+i+"-B. ").repeat(1200)));
    await transform(messages);
    messages.push({role:"assistant",content:[{type:"text",text:"Finished inspection with one recorded failure."}],timestamp:20+i});
    transform.captureCommittedTask?.(messages);
    messages=transform.releaseCommittedHistory(messages);
  }
  return {mode,elapsedMs:performance.now()-start,requests:calls.length,bytes:calls.reduce((n,r)=>n+r.bytes,0),
    stable:calls.filter(c=>c.scope==="stable").length,active:calls.filter(c=>c.scope==="active").length,
    oldHistoryRequests:calls.filter(c=>c.old).length,compacted:transform.compactedCount(),retained:messages.length};
}
try{
  const baseline=(await import(pathToFileURL(baselinePath).href)).createHarnessContextTransform;
  const results=[];
  for(const mode of ["baseline","split","split","baseline"]){
    results.push(await replay(mode==="baseline"?baseline:createHarnessContextTransform,mode,results.length));
  }
  assert.ok(results[1].bytes<results[0].bytes);
  assert.ok(results[1].requests<=results[0].requests);
  console.log(JSON.stringify(results,null,2));
}finally{await rm(root,{recursive:true,force:true});await rm(baselinePath,{force:true});}
