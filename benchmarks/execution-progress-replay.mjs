import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {writeFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {performance} from "node:perf_hooks";
import {ExecutionProgressLedger} from "../packages/core/dist/harness/execution-progress.js";

const root=fileURLToPath(new URL("../",import.meta.url));
const require=createRequire(new URL("../packages/core/package.json",import.meta.url));
const ts=require("typescript");
const baselinePath=join(root,"packages/core/dist/harness/.progress-baseline-"+process.pid+".mjs");
const oldSource=execFileSync("git",["show","2881eb96:packages/core/src/harness/execution-progress.ts"],{cwd:root,encoding:"utf8"});
await writeFile(baselinePath,ts.transpileModule(oldSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,{flag:"wx"});
const exchanges=Array.from({length:320},(_,i)=>{
  const id="call-"+i,path='证据/"'+i+'"/📚.txt';
  const write=i%19===0, isError=i%11===0;
  const toolName=write?"workspace__write":"workspace__read";
  return [{role:"assistant",content:[{type:"toolCall",id,name:toolName,arguments:{path,revisionId:"r"+i,ignored:"body"}}]},
    {role:"toolResult",toolCallId:id,toolName,isError,content:[{type:"text",text:("Evidence record "+i+" 中文📚\n").repeat(320)}],
      details:{data:{kind:"fixture",completedCount:i},hostExecution:{risk:write?"write":"read",status:isError?"error":"success",artifacts:[]}}}];
});
try{
  const {executionProgress:baseline}=await import(pathToFileURL(baselinePath).href);
  const results=[];
  const expected=[];
  const budget=8000;
  for(const mode of ["baseline","incremental","incremental","baseline"]){
    const messages=[],ledger=new ExecutionProgressLedger(budget),outputs=[];
    const start=performance.now();
    for(const pair of exchanges){
      messages.push(...pair);
      if(mode==="incremental"){for(const message of pair)ledger.record(message);outputs.push(ledger.render());}
      else outputs.push(baseline(messages,budget));
    }
    const elapsedMs=performance.now()-start;
    if(!expected.length)expected.push(...outputs);
    else assert.deepEqual(outputs,expected);
    results.push({mode,elapsedMs,exchanges:exchanges.length,
      processedMessages:mode==="incremental"?messages.length:exchanges.length*(exchanges.length+1),lastReceiptBytes:Buffer.byteLength(outputs.at(-1))});
  }
  // The previous algorithm is the oracle for ordering and truncation at
  // different budgets, including budgets smaller than the fixed totals.
  for(const budget of [100,128,256,512,8000,32000]){
    const ledger=new ExecutionProgressLedger(budget),messages=[];
    for(const pair of exchanges){
      messages.push(...pair);
      for(const message of pair)ledger.record(message);
    }
    assert.equal(ledger.render(),baseline(messages,budget));
  }
  console.log(JSON.stringify(results,null,2));
}finally{await rm(baselinePath,{force:true});}
