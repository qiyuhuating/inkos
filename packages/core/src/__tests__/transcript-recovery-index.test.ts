import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { appendTranscriptSequenceEvents, readTranscriptPage, readTranscriptRevision, readTranscriptEvents, transcriptPath } from "../interaction/session-transcript.js";
import { adaptRestoredAgentMessagesForModel, restoreAgentMessagesFromEvents, restoreAgentMessagesFromTranscript } from "../interaction/session-transcript-restore.js";
import { restoreIndexedConversation, advanceConversationIndex } from "../interaction/transcript-recovery-index.js";
import { transcriptIndexPath } from "../interaction/transcript-index.js";
import { digestConversationMessages } from "../harness/agent-context.js";
import { deleteBookSession } from "../interaction/book-session-store.js";
import type { TranscriptEvent } from "../interaction/session-transcript-schema.js";

const model={id:"fixture",api:"openai-completions",provider:"openai"};
const sessionId="indexed-session";
function request(seq:number,text:string):TranscriptEvent[]{
  const base={version:1 as const,sessionId,timestamp:seq,requestId:"request-"+seq};
  return [
    {...base,type:"request_started",seq,sessionKind:"chat",input:text},
    {...base,type:"message",seq:seq+1,uuid:"user-"+seq,parentUuid:null,role:"user",message:{role:"user",content:text,timestamp:seq}},
    {...base,type:"message",seq:seq+2,uuid:"assistant-"+seq,parentUuid:"user-"+seq,role:"assistant",
      message:{role:"assistant",content:[{type:"text",text:"Recorded "+seq}],timestamp:seq,...model,model:model.id}},
    {...base,type:"request_committed",seq:seq+3},
  ];
}
function projected(events:TranscriptEvent[]):AgentMessage[]{
  return adaptRestoredAgentMessagesForModel(restoreAgentMessagesFromEvents(events,"chat"),model,true);
}
function checkpoint(events:TranscriptEvent[]){
  const messages=projected(events);
  return {count:messages.length,digest:digestConversationMessages(messages),summary:"Verified notes."};
}

describe("streamed transcript recovery index",()=>{
  it("certifies a prefix without retaining it, seeks only the tail, advances after append, and rejects rewritten history",async()=>{
    const root=await mkdtemp(join(tmpdir(),"inkos-transcript-index-"));
    try{
      const prefix=Array.from({length:8},(_,i)=>request(i*4+1,("Record "+i+" 中文📚\n").repeat(12000))).flat();
      const tail=request(33,"Recent evidence.");
      await appendTranscriptSequenceEvents(root,sessionId,()=>[...prefix,...tail]);
      const revision=await readTranscriptRevision(root,sessionId);
      const options={root,sessionId,sessionKind:"chat" as const,identity:"fixture-model",model,canReadArchives:true,revision,checkpoint:checkpoint(prefix)};
      const rebuilt=await restoreIndexedConversation(options);
      expect(rebuilt?.usedIndex).toBe(false);
      expect(rebuilt?.scannedBytes).toBe(revision.byteLength);
      expect(rebuilt?.messages).toEqual(projected(tail));
      const fast=await restoreIndexedConversation(options);
      expect(fast?.usedIndex).toBe(true);
      expect(fast?.messages).toEqual(rebuilt?.messages);
      expect(fast?.scannedBytes).toBeLessThan(2048);
      expect(fast?.index.byteOffset).toBe(revision.byteLength-fast!.scannedBytes);
      const next=request(37,"Continue.");
      await appendTranscriptSequenceEvents(root,sessionId,()=>next);
      const later=await readTranscriptRevision(root,sessionId);
      expect(later.generation).toBe(revision.generation);
      const nextOptions={...options,revision:later,checkpoint:checkpoint([...prefix,...tail])};
      const advanced=await advanceConversationIndex(nextOptions,fast!.index,revision);
      expect(advanced?.byteOffset).toBe(revision.byteLength);
      expect((await restoreIndexedConversation(nextOptions))?.messages).toEqual(projected(next));
      const path=transcriptPath(root,sessionId);
      const original=await readFile(path,"utf8");
      await writeFile(path,original.replaceAll("Record 0","Record X"));
      const changed=await readTranscriptRevision(root,sessionId);
      expect(changed.lastCommittedSeq).toBe(later.lastCommittedSeq);
      expect(changed.generation).not.toBe(later.generation);
      expect(await restoreIndexedConversation({...nextOptions,revision:changed})).toBeUndefined();
      expect(await advanceConversationIndex({...nextOptions,revision:changed},advanced,later)).toBeUndefined();
      await deleteBookSession(root,sessionId);
      await expect(readFile(transcriptIndexPath(root,sessionId,"sequence"))).rejects.toMatchObject({code:"ENOENT"});
      await expect(readFile(transcriptIndexPath(root,sessionId,"window"))).rejects.toMatchObject({code:"ENOENT"});
    }finally{await rm(root,{recursive:true,force:true});}
  });

  it("reads lossless byte-cursor pages across Unicode records and rejects a stale cursor",async()=>{
    const root=await mkdtemp(join(tmpdir(),"inkos-transcript-pages-"));
    try{
      const events=[...request(1,"A中文📚\n".repeat(30000)),...request(5,"Second")];
      const path=transcriptPath(root,sessionId);
      await mkdir(join(root,".inkos","sessions"),{recursive:true});
      await writeFile(path,events.map(event=>JSON.stringify(event)).join("\r\n")+"\r\n");
      const first=await readTranscriptPage(root,sessionId,undefined,2);
      expect(first.events).toEqual(events.slice(0,2));
      const all=[...first.events];
      let cursor=first.nextCursor;
      while(cursor){const page=await readTranscriptPage(root,sessionId,cursor,2);all.push(...page.events);cursor=page.nextCursor;}
      expect(all).toEqual(await readTranscriptEvents(root,sessionId));
      await appendTranscriptSequenceEvents(root,sessionId,()=>request(9,"Third"));
      await expect(readTranscriptPage(root,sessionId,first.nextCursor!,2)).rejects.toThrow("stale");
    }finally{await rm(root,{recursive:true,force:true});}
  });

  it("does not certify a noncontiguous legacy request layout",async()=>{
    const root=await mkdtemp(join(tmpdir(),"inkos-transcript-legacy-"));
    try{
      const a=request(1,"First"),b=request(5,"Second");
      const events=[a[0]!,b[0]!,a[1]!,a[2]!,a[3]!,b[1]!,b[2]!,b[3]!].map((event,index)=>({...event,seq:index+1}));
      await appendTranscriptSequenceEvents(root,sessionId,()=>events);
      const revision=await readTranscriptRevision(root,sessionId);
      expect(await restoreIndexedConversation({root,sessionId,sessionKind:"chat",identity:"model",model,canReadArchives:true,revision,checkpoint:checkpoint(a)})).toBeUndefined();
      expect(await restoreAgentMessagesFromTranscript(root,sessionId,"chat")).toHaveLength(4);
    }finally{await rm(root,{recursive:true,force:true});}
  });
});
