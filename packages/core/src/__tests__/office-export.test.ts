import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import JSZip from "jszip";
import { createWorkManifest, saveWorkManifest, loadWorkManifest } from "../harness/work-store.js";
import { syncWorkSourceArtifacts } from "../harness/source-sync.js";
import { createExportWorkTool } from "../harness/tools/work-artifacts.js";
import { extractDocx, extractXlsx } from "../utils/office-document.js";

describe("native Office work export",()=>{
  it("registers native editable files from the exact current Markdown and JSON revision",async()=>{
    const root=await mkdtemp(join(tmpdir(),"inkos-office-export-"));
    try{
      await saveWorkManifest(root,createWorkManifest({id:"report",title:"预算与工作",profileId:"workspace-default",language:"zh"}));
      const source="## 验收说明\n\n第一段 & 记录。\n\n| 项目 | 数量 |\n| --- | --- |\n| 设备 | 2 |\n";
      const data=JSON.stringify([{item:"设备",count:2,verified:true,note:"=1+1"},{item:"文档",count:3,verified:false,note:"原文"}]);
      await mkdir(join(root,"works/report/source"),{recursive:true});
      const work=await syncWorkSourceArtifacts({projectRoot:root,workId:"report",accept:true,writes:[
        {relativePath:"works/report/source/report.md",content:source},
        {relativePath:"works/report/source/data.json",content:data},
      ]});
      const doc=work.artifacts.find(a=>a.revisions.some(r=>r.path==="source/report.md"))!;
      const sheet=work.artifacts.find(a=>a.revisions.some(r=>r.path==="source/data.json"))!;
      const tool=createExportWorkTool(root,"report");
      const docResult=await tool.execute("doc",{artifactId:doc.id,expectedRevisionId:doc.currentRevisionId!,format:"docx"});
      const sheetResult=await tool.execute("sheet",{artifactId:sheet.id,expectedRevisionId:sheet.currentRevisionId!,format:"xlsx"});
      const docPath=(docResult.details as {path:string}).path,sheetPath=(sheetResult.details as {path:string}).path;
      const docBytes=await readFile(join(root,"works/report",docPath)),sheetBytes=await readFile(join(root,"works/report",sheetPath));
      expect(await extractDocx(docBytes)).toContain("## 验收说明\n\n第一段 & 记录。\n\n项目\t数量\n设备\t2");
      expect(await extractXlsx(sheetBytes)).toContain('A2="设备"\tB2="2"\tC2="TRUE"\tD2="=1+1"');
      const zip=await JSZip.loadAsync(sheetBytes);
      const xml=await zip.file("xl/worksheets/sheet1.xml")!.async("string");
      expect(xml).toContain('<c r="B2"><v>2</v></c>');
      expect(xml).toContain('<c r="D2" t="inlineStr">');
      expect(xml).not.toContain("<f>");
      const updated=await loadWorkManifest(root,"report");
      expect(updated.artifacts.flatMap(a=>a.revisions).find(r=>r.path===docPath)?.contentType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      expect(updated.artifacts.flatMap(a=>a.revisions).find(r=>r.path===sheetPath)?.contentType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      expect(await readFile(join(root,"works/report/source/report.md"),"utf8")).toBe(source);
      expect(await readFile(join(root,"works/report/source/data.json"),"utf8")).toBe(data);
    }finally{await rm(root,{recursive:true,force:true});}
  });
});
