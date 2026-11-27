import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { ToolResultArchive } from "../agent/tool-result-archive.js";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";

describe("session tool result archive", () => {
  it("offloads exact large observations and details with UTF-8 pages and session isolation", async () => {
    const root=await mkdtemp(join(tmpdir(),"inkos-archived-read-"));
    try{
      const archive=new ToolResultArchive(root,"session-a");
      const text="Start! "+"文档📚与原文\uFEFF".repeat(4000);
      const original:AgentToolResult<unknown>={content:[{type:"text",text}],details:{
        kind:"artifact_read",artifactId:"artifact-1",revisionId:"revision-1",
        displayText:text,hostExecution:{risk:"read",status:"success",artifacts:[]},
      }};
      const projected=await archive.project(original);
      const details=projected.details as {archivedResult:{id:string;contentHash:string;bytes:number;nextOffset:number};artifactId:string;revisionId:string;hostExecution:unknown};
      const ref=details.archivedResult;
      expect(details.artifactId).toBe("artifact-1");
      expect(details.revisionId).toBe("revision-1");
      expect(details.hostExecution).toEqual({risk:"read",status:"success",artifacts:[]});
      expect(ref.contentHash).toBe(createHash("sha256").update(JSON.stringify(original.content)).digest("hex"));
      expect(JSON.stringify(projected).length).toBeLessThan(JSON.stringify(original).length/3);
      const {adaptRestoredAgentMessagesForModel}=await import("../interaction/session-transcript-restore.js");
      const observation={role:"toolResult",toolCallId:"historical-read",toolName:"workspace__read",isError:false,timestamp:1,...projected} as any;
      const historical=adaptRestoredAgentMessagesForModel([observation],{},true);
      const full=adaptRestoredAgentMessagesForModel([observation],{});
      expect(JSON.stringify(historical)).toContain(ref.id);
      expect(JSON.stringify(historical)).toContain(ref.contentHash);
      expect(JSON.stringify(historical)).toContain("from offset 0");
      expect(JSON.stringify(historical).length).toBeLessThan(JSON.stringify(full).length/2);
      expect(JSON.stringify(historical)).not.toContain("nextOffset");
      let recovered="",offset:number|null=0;
      do{
        const page=await archive.read(ref.id,offset);
        recovered+=page.text;
        offset=page.nextOffset;
        expect(Buffer.byteLength(page.text)).toBeLessThanOrEqual(8192);
      }while(offset!==null);
      expect(recovered).toBe(text);
      const scope=createHash("sha256").update("session-a").digest("hex");
      expect(JSON.parse(await readFile(join(root,".inkos","tool-results",scope,ref.id+".json"),"utf8"))).toEqual(original);
      await expect(new ToolResultArchive(root,"session-b").read(ref.id,0)).rejects.toMatchObject({code:"ENOENT"});
      await expect(archive.read("../outside",0)).rejects.toThrow("Invalid archived");
      const small:AgentToolResult<unknown>={content:[{type:"text",text:"small"}],details:{}};
      expect(await archive.project(small)).toBe(small);
      const page=await archive.tool().execute("read",{id:ref.id,offset:0});
      expect(JSON.parse((page.content[0] as {text:string}).text)).toEqual(await archive.read(ref.id,0));
      const {deleteBookSession}=await import("../interaction/book-session-store.js");
      await deleteBookSession(root,"session-a");
      await expect(archive.read(ref.id,0)).rejects.toMatchObject({code:"ENOENT"});
    }finally{await rm(root,{recursive:true,force:true});}
  });
});
