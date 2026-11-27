import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import JSZip from "jszip";
import { ingestMaterial } from "../materials/ingest.js";
import { retrieveMaterials } from "../materials/retrieve.js";

describe("Office document materials", () => {
  it("archives DOCX headings, paragraph order and table cells as searchable text", async () => {
    const root = await mkdtemp(join(tmpdir(),"inkos-docx-"));
    try {
      const zip = new JSZip();
      zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
        + '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>验收记录</w:t></w:r></w:p>'
        + '<w:p><w:r><w:t>甲 &amp; 乙</w:t></w:r><w:r><w:t>完成工作</w:t></w:r></w:p>'
        + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>字段</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>冷库账页</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
        + '<w:p><w:r><w:t>结束</w:t></w:r></w:p></w:body></w:document>');
      await writeFile(join(root,"report.docx"),await zip.generateAsync({type:"nodebuffer"}));
      const asset=await ingestMaterial(root,{sourceKind:"file",filePath:"report.docx"});
      expect(asset.kind).toBe("docx");
      expect(await readFile(join(root,asset.markdownPath),"utf8")).toContain("# 验收记录\n\n甲 & 乙完成工作\n\n字段\t冷库账页\n\n结束");
      const matches=await retrieveMaterials(root,{query:"冷库账页"});
      expect(matches.some(result=>result.id===asset.id)).toBe(true);
    } finally {await rm(root,{recursive:true,force:true});}
  });

  it("archives XLSX worksheets in workbook order with coordinates and formula caches", async () => {
    const root = await mkdtemp(join(tmpdir(),"inkos-xlsx-"));
    try {
      const zip=new JSZip();
      zip.file("xl/workbook.xml",'<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="预算" sheetId="2" r:id="rId2"/><sheet name="说明" sheetId="1" r:id="rId1"/></sheets></workbook>');
      const type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
      zip.file("xl/_rels/workbook.xml.rels",'<Relationships><Relationship Id="rId1" Type="'+type+'" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="'+type+'" Target="worksheets/sheet2.xml"/></Relationships>');
      zip.file("xl/sharedStrings.xml",'<sst><si><r><t>收入</t></r><r><t>合计</t></r></si></sst>');
      zip.file("xl/worksheets/sheet2.xml",'<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><f>SUM(A2:A3)</f><v>42</v></c><c r="D1" t="b"><v>1</v></c></row></sheetData></worksheet>');
      zip.file("xl/worksheets/sheet1.xml",'<worksheet><sheetData><row r="1"><c r="B1" t="inlineStr"><is><t>说明 &amp; 注释</t></is></c></row></sheetData></worksheet>');
      await writeFile(join(root,"budget.xlsx"),await zip.generateAsync({type:"nodebuffer"}));
      const asset=await ingestMaterial(root,{sourceKind:"file",filePath:"budget.xlsx"});
      expect(asset.kind).toBe("xlsx");
      const markdown=await readFile(join(root,asset.markdownPath),"utf8");
      expect(markdown).toContain('# 预算\nA1="收入合计"\tC1="=SUM(A2:A3) [cached: 42]"\tD1="TRUE"\n\n# 说明\nB1="说明 & 注释"');
    } finally {await rm(root,{recursive:true,force:true});}
  });

  it("rejects document XML containing entity declarations before extraction", async () => {
    const root=await mkdtemp(join(tmpdir(),"inkos-office-xml-"));
    try{
      const zip=new JSZip();
      zip.file("word/document.xml",'<!DOCTYPE document [<!ENTITY data "injected">]><document><body><p><r><t>&data;</t></r></p></body></document>');
      await writeFile(join(root,"unsafe.docx"),await zip.generateAsync({type:"nodebuffer"}));
      await expect(ingestMaterial(root,{sourceKind:"file",filePath:"unsafe.docx"})).rejects.toThrow("DTD or entity");
    }finally{await rm(root,{recursive:true,force:true});}
  });
});
