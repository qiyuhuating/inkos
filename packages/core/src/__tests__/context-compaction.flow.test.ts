import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ContextSourceRegistry,
  ProtectedContextOverflowError,
  compileContext,
  createBuiltInWorkProfileRegistry,
  createHarnessContextTransform,
  createWorkManifest,
  loadWorkManifest,
  saveWorkManifest,
  type ContextFragment,
} from "../harness/index.js";

describe("context assembly mini-flow", () => {
  it('retains exact progress and recent failures without recompacting the same completed history',async()=>{
    let calls=0;
    const transform=createHarnessContextTransform({projectRoot:'/tmp',work:null,profile:createBuiltInWorkProfileRegistry().require('workspace-default'),budgetTokens:2000,
      conversationCompactor:async()=>{calls++;return 'All requested files were read.';}});
    const user={role:'user',content:'Read files a and b, then export.',timestamp:1};
    const history=[user,{role:'assistant',content:[{type:'toolCall',id:'a',name:'workspace__read',arguments:{path:'works/w/source/a.md'}}]},
      {role:'toolResult',toolCallId:'a',toolName:'workspace__read',isError:false,content:[{type:'text',text:'Real source paragraph. '.repeat(2000)}]}] as never[];
    await transform(history);
    const failure={role:'toolResult',toolCallId:'b',toolName:'workspace__read',isError:true,content:[{type:'text',text:'{"code":"WORK_PATH_IS_DIRECTORY"}'}]};
    const next=await transform([...history,{role:'assistant',content:[{type:'toolCall',id:'b',name:'workspace__read',arguments:{path:'works/w/source/'}}]},failure] as never[]);
    expect(calls).toBe(1);
    expect(next.at(-1)).toEqual(failure);
    const receipt=next.find(m=>m.role==='user'&&typeof m.content==='string'&&m.content.startsWith('<host_execution_progress>')) as {content:string};
    const progress=JSON.parse(receipt.content.split('\n')[1]!);
    expect(progress.totals).toEqual({successful:1,failed:1,uniqueReadPaths:1});
    expect(progress.readPaths).toEqual(['works/w/source/a.md']);
    expect(progress.recent.at(-1)).toMatchObject({status:'error',arguments:{path:'works/w/source/'}});
  });
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("reloads Work identity while leaving domain source selection to capabilities", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkos-context-flow-"));
    roots.push(root);
    const profile = createBuiltInWorkProfileRegistry().require("longform-novel");
    const work = createWorkManifest({
      id: "harbor",
      title: "Before",
      profileId: profile.id,
      language: "en",
    });
    await saveWorkManifest(root, work);
    const transform = createHarnessContextTransform({ projectRoot: root, work, profile, budgetTokens: 8_000 });

    const first = await transform([{ role: "user", content: "status", timestamp: 1 }] as never);
    const current = await loadWorkManifest(root, work.id);
    await saveWorkManifest(root, { ...current, title: "After", updatedAt: new Date().toISOString() });
    const second = await transform([{ role: "user", content: "status", timestamp: 2 }] as never);
    const firstContext = first[0] as { content: string };
    const secondContext = second[0] as { content: string };

    expect({
      firstHasOldTitle: firstContext.content.includes('"title":"Before"'),
      secondHasNewTitle: secondContext.content.includes('"title":"After"'),
      includesDomainSourceText: secondContext.content.includes("author_intent.md") || secondContext.content.includes("current_focus.md"),
      messageCount: second.length,
    }).toEqual({
      firstHasOldTitle: true,
      secondHasNewTitle: true,
      includesDomainSourceText: false,
      messageCount: 2,
    });

    const protectedText = "First-person canon stays fixed.".repeat(10);
    const fragments: ContextFragment[] = [
      { id: "intent", source: "intent", content: protectedText, protection: "protected", priority: 100 },
      { id: "history", source: "history", content: "Older background. ".repeat(200), protection: "compressible", priority: 10 },
    ];
    const sources = new ContextSourceRegistry();
    sources.register({ id: "flow", async load() { return fragments; } });
    let compiledIds: string[] = [];
    const compiled = await compileContext({
      recipe: { id: "chapter", sourceIds: ["flow"] },
      sources,
      request: { projectRoot: root, work, profile, actionId: "draft", intent: "continue" },
      budgetTokens: 120,
      compiler: async (request) => {
        compiledIds = request.fragments.map((fragment) => fragment.id);
        return { content: "Background summary.", sourceIds: compiledIds };
      },
    });
    expect({ compiledIds, protectedIds: compiled.trace.protectedSourceIds }).toEqual({
      compiledIds: ["history"],
      protectedIds: ["intent"],
    });
  });

  it("fails loudly when protected context alone exceeds the budget", async () => {
    const profile = createBuiltInWorkProfileRegistry().require("longform-novel");
    const sources = new ContextSourceRegistry();
    sources.register({
      id: "protected",
      async load() {
        return [{
          id: "canon",
          source: "canon",
          content: "不可压缩正史。".repeat(500),
          protection: "protected",
          priority: 100,
        } as const];
      },
    });

    await expect(compileContext({
      recipe: { id: "chapter", sourceIds: ["protected"] },
      sources,
      request: { projectRoot: "/tmp", work: null, profile, actionId: "draft", intent: "continue" },
      budgetTokens: 30,
    })).rejects.toBeInstanceOf(ProtectedContextOverflowError);
  });

  it("reuses immutable message metrics but invalidates a summary when earlier content is replaced", async () => {
    const profile=createBuiltInWorkProfileRegistry().require("workspace-default");
    const histories:string[]=[];
    const transform=createHarnessContextTransform({projectRoot:"/tmp",work:null,profile,budgetTokens:250,immutableCompletedMessages:true,
      conversationCompactor:async request=>{histories.push(request.history);return "Verified fixture summary.";}});
    const old={role:"user",content:"Old fact. ".repeat(400),timestamp:1} as const;
    const current={role:"user",content:"Continue.",timestamp:2} as const;
    await transform([old,current] as never);
    await transform([old,{...current,timestamp:3}] as never);
    expect(histories).toHaveLength(1);
    await transform([{...old,content:"Corrected fact. ".repeat(400)},current] as never);
    expect(histories).toHaveLength(2);
    expect(histories[1]).toContain("Corrected fact.");
    expect(histories[1]).not.toContain("Old fact.");
  });

  it("compacts the complete historical middle only after the session budget is exceeded", async () => {
    const profile = createBuiltInWorkProfileRegistry().require("workspace-default");
    const history = "Earlier decision and tool outcome. ".repeat(200);
    let receivedHistory = "";
    const phases: string[] = [];
    const transform = createHarnessContextTransform({
      projectRoot: "/tmp",
      work: null,
      profile,
      budgetTokens: 220,
      conversationCompactor: async (request) => {
        receivedHistory = request.history;
        return "- The user approved the earlier decision.\n- The tool completed the artifact.";
      },
      onContextCompression: (event) => phases.push(event.phase),
    });
    const result = await transform([
      { role: "user", content: history, timestamp: 1 },
      { role: "assistant", content: [{ type: "text", text: history }], timestamp: 2 },
      { role: "user", content: "Apply that decision to the next chapter.", timestamp: 3 },
    ] as never);

    expect(receivedHistory).toContain("Earlier decision and tool outcome");
    const { convertAgentMessagesForModel } = await import("../agent/agent-session.js");
    const delivered = convertAgentMessagesForModel(result);
    expect(delivered).toEqual(result);
    expect(delivered[0]).toMatchObject({role:"user",content:expect.any(String)});
    expect(JSON.stringify(result)).toContain("conversation_summary");
    expect(JSON.stringify(result)).toContain("Apply that decision to the next chapter");
    expect(phases).toEqual(["start", "end"]);
  });

  it("uses an addressable archive projection before paying for semantic compaction",async()=>{
    const {compactArchivedObservation}=await import("../agent/archived-observation.js");
    const {executionProgress}=await import("../harness/execution-progress.js");
    const reference={id:"a".repeat(64),contentHash:"b".repeat(64),bytes:100000,nextOffset:8192};
    const preview="Original evidence. ".repeat(500);
    const observation={
      role:"toolResult",toolCallId:"read",toolName:"workspace__read",isError:false,timestamp:3,
      content:[{type:"text",text:JSON.stringify({status:"success",archivedResult:reference,preview,facts:{kind:"file_read"}})}],
      details:{archivedResult:reference,displayText:preview,hostExecution:{risk:"read",status:"success",artifacts:[]}},
    } as import("@mariozechner/pi-agent-core").AgentMessage;
    const call={role:"assistant",timestamp:2,content:[{type:"toolCall",id:"read",name:"workspace__read",arguments:{path:"evidence.txt"}}]};
    const messages=[{role:"user",content:"Prior evidence. ".repeat(50),timestamp:0},
      {role:"user",content:"Read evidence.txt",timestamp:1},call,observation] as import("@mariozechner/pi-agent-core").AgentMessage[];
    let calls=0;
    const transform=createHarnessContextTransform({projectRoot:"/tmp",work:null,profile:createBuiltInWorkProfileRegistry().require("workspace-default"),
      budgetTokens:1800,compactActiveArchives:true,conversationCompactor:async()=>{calls++;return "Notes";}});
    const projected=await transform(messages);
    expect(calls).toBe(0);
    const shortened=projected.find(message=>message.role==="toolResult");
    expect(shortened).not.toBe(observation);
    expect(JSON.stringify(shortened)).toContain(reference.id);
    expect(JSON.stringify(shortened)).not.toContain(preview);
    expect(JSON.stringify(observation)).toContain(preview);
    expect(executionProgress([call,observation] as never,8000)).toBe(executionProgress([call,shortened] as never,8000));
    if(observation.role!=="toolResult")throw Error("Expected tool result");
    const failure={...observation,isError:true};
    expect(compactArchivedObservation(failure)).toBe(failure);
    const mutation={...observation,details:{...observation.details,hostExecution:{risk:"write",status:"success",artifacts:[]}}};
    expect(compactArchivedObservation(mutation)).toBe(mutation);
    const noArchive=createHarnessContextTransform({projectRoot:"/tmp",work:null,profile:createBuiltInWorkProfileRegistry().require("workspace-default"),budgetTokens:1800,
      conversationCompactor:async()=>{calls++;return "Notes";}});
    await noArchive(messages);
    expect(calls).toBe(1);
  });
  it("compacts completed reads within the active turn while preserving the user's request", async () => {
    const profile = createBuiltInWorkProfileRegistry().require("workspace-default");
    const user = {role:"user",content:"Write the next three chapters.",timestamp:1};
    let history = "";
    const transform = createHarnessContextTransform({projectRoot:"/tmp",work:null,profile,budgetTokens:220,
      conversationCompactor:async (request)=>{history=request.history;return "Read works/novel/source/outline.md; writing remains pending.";},
    });
    const result = await transform([user,
      {role:"assistant",content:[{type:"toolCall",id:"read-1",name:"workspace__read",arguments:{path:"works/novel/source/outline.md"}}]},
      {role:"toolResult",toolCallId:"read-1",toolName:"workspace__read",content:[{type:"text",text:"A complete source paragraph. ".repeat(200)}],isError:false},
    ] as never);
    const records = history.split("\n").map((line)=>JSON.parse(line));
    expect(records.map((record)=>record.role)).toEqual(["assistant","toolResult"]);
    expect(records[1].toolCallId).toBe("read-1");
    expect(result.at(-1)).toEqual(user);
    expect(result.some((message)=>message.role==="toolResult")).toBe(false);
    history = "";
    const smallResult = {role:"toolResult",toolCallId:"read-2",toolName:"workspace__read",content:[{type:"text",text:"Ready"}],isError:false,details:{preview:"UI metadata. ".repeat(5000)}};
    const uncompressed = await transform([user,
      {role:"assistant",content:[{type:"toolCall",id:"read-2",name:"workspace__read",arguments:{}}]},smallResult,
    ] as never);
    expect(history).toBe("");
    expect(uncompressed.at(-1)).toEqual(smallResult);
  });
});
