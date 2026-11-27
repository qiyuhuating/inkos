import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationCheckpointStore } from "../harness/conversation-checkpoint.js";
import { createHarnessContextTransform } from "../harness/agent-context.js";
import { createBuiltInWorkProfileRegistry } from "../harness/builtin-profiles.js";
import { deleteBookSession } from "../interaction/book-session-store.js";
import { splitTextByEstimatedTokens } from "../llm/semantic-input.js";
import { reduceSemanticText } from "../llm/semantic-reduction.js";
import { estimateTextTokens } from "../llm/provider.js";
import type { AgentMessage } from "@mariozechner/pi-agent-core";

describe("durable conversation checkpoint", () => {
  it("reuses a validated prefix across independently created transforms, invalidates changed history and model identity", async () => {
    const root = await mkdtemp(join(tmpdir(),"inkos-checkpoint-"));
    try {
      const profile=createBuiltInWorkProfileRegistry().require("workspace-default");
      const histories:string[]=[];
      const make = (identity="model-a",session="session-a") => createHarnessContextTransform({
        projectRoot:root,work:null,profile,budgetTokens:250,immutableCompletedMessages:true,
        checkpoint:new ConversationCheckpointStore(root,session,identity),
        conversationCompactor:async ({history})=>{histories.push(history);return "Fixture notes.";}
      });
      const history=[{role:"user",content:"Original fact. ".repeat(500),timestamp:1},{role:"user",content:"Continue.",timestamp:2}] as AgentMessage[];
      const result=await make()(history);
      expect(histories).toHaveLength(1);
      // New instances and JSON cloning model the on-disk transcript restoration boundary.
      expect((await make()(JSON.parse(JSON.stringify(history)))).map(m=>({role:m.role,content:m.content})))
        .toEqual(result.map(m=>({role:m.role,content:m.content})));
      expect(histories).toHaveLength(1);
      await make("model-b")(history);
      expect(histories).toHaveLength(2);
      await make("model-b","session-b")(history);
      expect(histories).toHaveLength(3);
      const changed=[{...history[0],content:"Changed fact. ".repeat(500)},history[1]] as AgentMessage[];
      await make("model-b")(changed);
      expect(histories).toHaveLength(4);
      expect(histories.at(-1)).toContain("Changed fact.");
      expect(histories.at(-1)).not.toContain("Original fact.");
      const files=await readdir(join(root,".inkos","conversation-checkpoints"));
      expect(files).toHaveLength(2);
      await deleteBookSession(root,"session-a");
      expect(await new ConversationCheckpointStore(root,"session-a","model-b").load()).toBeUndefined();
      expect(await new ConversationCheckpointStore(root,"session-b","model-b").load()).toBeDefined();
    } finally {await rm(root,{recursive:true,force:true});}
  });

  it("does not overwrite a durable prefix with a summary of the active tool loop", async () => {
    const root=await mkdtemp(join(tmpdir(),"inkos-active-checkpoint-"));
    try {
      const checkpoint=new ConversationCheckpointStore(root,"session","identity");
      const transform=createHarnessContextTransform({projectRoot:root,work:null,profile:createBuiltInWorkProfileRegistry().require("workspace-default"),budgetTokens:1000,checkpoint,
        conversationCompactor:async()=> "Fixture notes."});
      const old={role:"user",content:"Old decision. ".repeat(500),timestamp:1};
      const user={role:"user",content:"Read evidence.",timestamp:2};
      const messages=[old,user] as AgentMessage[];
      await transform(messages);
      const saved=await checkpoint.load();
      expect(saved?.count).toBe(1);
      await transform([...messages,{role:"assistant",content:[{type:"toolCall",id:"read-1",name:"workspace__read",arguments:{path:"evidence.txt"}}]},
        {role:"toolResult",toolCallId:"read-1",toolName:"workspace__read",content:[{type:"text",text:"Evidence. ".repeat(1000)}],isError:false}] as AgentMessage[]);
      expect(await checkpoint.load()).toEqual(saved);
    } finally {await rm(root,{recursive:true,force:true});}
  });
});

describe("bounded semantic reduction", () => {
  it("splits Unicode losslessly and never exceeds the estimated input budget", () => {
    const source="前言📚\n"+"长文🙂abc".repeat(10000)+"\n尾声";
    const chunks=splitTextByEstimatedTokens(source,257);
    expect(chunks.join("")).toBe(source);
    expect(chunks.every(chunk=>estimateTextTokens(chunk)<=257)).toBe(true);
    expect(chunks.every(chunk=>!/[\ud800-\udbff]$|^[\udc00-\udfff]/u.test(chunk))).toBe(true);
  });
  it("uses a useful segment budget regardless of segment count, and terminates with a bounded final result", async () => {
    const source="record evidence. ".repeat(5000);
    const calls:{input:string;budget:number}[]=[];
    const result=await reduceSemanticText({text:source,inputBudget:1024,outputBudget:128,compile:async(input,budget)=>{
      calls.push({input,budget});return "Recorded notes. ".repeat(20);
    }});
    expect(result).toBe("Recorded notes. ".repeat(20).trim());
    expect(calls.length).toBeGreaterThan(10);
    expect(calls.every(call=>estimateTextTokens(call.input)<=1024&&call.budget===128)).toBe(true);
  });
  it("rejects a non-compressing model instead of recursively calling forever",async()=>{
    let calls=0;
    await expect(reduceSemanticText({text:"record. ".repeat(1000),inputBudget:128,outputBudget:32,
      compile:async(text)=>{calls++;return text;}})).rejects.toMatchObject({code:"CONTEXT_REDUCTION_NO_PROGRESS"});
    expect(calls).toBeLessThan(25);
    await expect(reduceSemanticText({text:"input",inputBudget:128,outputBudget:8,
      compile:async()=> "overlong output ".repeat(100)})).rejects.toMatchObject({code:"CONTEXT_OUTPUT_OVER_BUDGET"});
  });
});
