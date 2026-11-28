import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { createHash } from "node:crypto";
import { actionResultFacts } from "./action-observation.js";

const argumentKeys = new Set(["path","bookId","workId","worldId","nodeId","chapterNumber","subdir","format","outputDir","artifactId","revisionId","startLine","lineCount"]);
type ReceiptCall = {name:string; arguments:Record<string,unknown>};
type EncodedReceipt = {text?:string; length:number};

/** Request-local, deterministic receipt projection. The transcript is the
 * authoritative ledger; this accumulator retains only counts, call addresses,
 * unique read paths and the bounded most recent receipt encodings. */
export class ExecutionProgressLedger {
  private readonly calls = new Map<string,ReceiptCall>();
  private readonly paths = new Set<string>();
  private readonly encodedPaths:string[]=[];
  private pathChars=0;
  private readonly recent:EncodedReceipt[]=[];
  private successful=0;
  private failed=0;
  private verifiedActions=0;
  private successfulMutations=0;

  constructor(private readonly maxChars:number) {}

  record(message:AgentMessage):void {
    if(message.role==="assistant"){
      for(const part of message.content){
        if(part.type!=="toolCall")continue;
        const args=Object.fromEntries(Object.entries(part.arguments).filter(([key,value])=>argumentKeys.has(key)&&["string","number"].includes(typeof value)));
        this.calls.set(part.id,{name:part.name,arguments:args});
      }
    }
    if(message.role!=="toolResult")return;
    const call=this.calls.get(message.toolCallId);
    if(!call)return;
    const details=message.details as {data?:Record<string,unknown>;hostExecution?:{risk:string;status:string;artifacts:unknown[]};archivedResult?:{contentHash:string};archivedPage?:{contentHash:string}}|undefined;
    const facts=actionResultFacts(details?.data??details);
    const execution=details?.hostExecution;
    const status=message.isError?"error":"success";
    if(message.isError)this.failed++;else this.successful++;
    if(execution){
      this.verifiedActions++;
      if(!message.isError&&execution.status==="success"&&execution.risk!=="read")this.successfulMutations++;
    }
    const path=call.arguments.path;
    if(!message.isError&&call.name.split("__").at(-1)==="read"&&typeof path==="string"&&!this.paths.has(path)){
      const encoded=JSON.stringify(path);
      this.pathChars+=encoded.length+(this.encodedPaths.length?1:0);
      this.paths.add(path);
      this.encodedPaths.push(encoded);
    }
    const encoded=JSON.stringify({tool:call.name,status,arguments:call.arguments,
      resultHash:(details?.archivedResult?.contentHash??details?.archivedPage?.contentHash??createHash("sha256").update(JSON.stringify(message.content)).digest("hex")).slice(0,16),
      ...(Object.keys(facts).length?{facts}:{}),...(execution?{execution}:{})});
    this.recent.push({length:encoded.length,...(encoded.length<=this.maxChars?{text:encoded}:{})});
    if(this.recent.length>8)this.recent.shift();
  }

  render():string {
    const count=this.successful+this.failed;
    if(!count)return "";
    const totals={successful:this.successful,failed:this.failed,uniqueReadPaths:this.paths.size,
      ...(this.verifiedActions?{verifiedActions:this.verifiedActions,successfulMutations:this.successfulMutations}:{})};
    const prefix='{"scope":"current_user_request","totals":'+JSON.stringify(totals)+',"readPaths":[';
    const middle='],"recent":[';
    const suffix=(truncated:boolean)=>'],"truncated":'+String(truncated)+'}';
    let recent=this.recent.slice();
    let truncated=count>recent.length;
    const length=()=>prefix.length+this.pathChars+middle.length+
      recent.reduce((sum,item)=>sum+item.length,Math.max(0,recent.length-1))+suffix(truncated).length;
    while(recent.length&&(length()>this.maxChars||recent.some(item=>item.text===undefined))){
      recent.shift();
      truncated=true;
    }
    let paths=this.encodedPaths;
    if(length()>this.maxChars&&paths.length){
      // The old projection drops oldest paths only after all recent receipts.
      // Seek the bounded suffix from the end, rather than repeatedly serializing
      // or slicing the complete distinct-path history.
      truncated=true;
      const budget=this.maxChars-prefix.length-middle.length-suffix(true).length;
      let start=paths.length,chars=0;
      while(start>0){
        const next=paths[start-1]!.length+(start<paths.length?1:0);
        if(chars+next>budget)break;
        chars+=next;start--;
      }
      paths=paths.slice(start);
    }
    return prefix+paths.join(",")+middle+recent.map(item=>item.text!).join(",")+suffix(truncated);
  }
}

/** Reference projection for callers without a trusted append event stream. */
export function executionProgress(messages:readonly AgentMessage[],maxChars:number):string {
  const ledger=new ExecutionProgressLedger(maxChars);
  for(const message of messages)ledger.record(message);
  return ledger.render();
}
