import { posix } from "node:path";
import { Readable } from "node:stream";
import JSZip from "jszip";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { decodeDocumentText } from "./document-input.js";

type XmlNode = Record<string, unknown>;
const MAX_XML_BYTES = 32 * 1024 * 1024;
const MAX_OUTPUT_CHARS = 8 * 1024 * 1024;
const parser = new XMLParser({
  preserveOrder: true, removeNSPrefix: true, ignoreAttributes: false,
  parseTagValue: false, parseAttributeValue: false, trimValues: false, processEntities: false,
});

function children(node: XmlNode, name: string): XmlNode[] {
  return (node[name] as XmlNode[] | undefined) ?? [];
}

function elements(nodes: readonly XmlNode[], name: string): XmlNode[] {
  return nodes.filter(node => Array.isArray(node[name]));
}

function attrs(node: XmlNode): Record<string, string> {
  return (node[":@"] as Record<string, string> | undefined) ?? {};
}

function decodeXml(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g, entity => {
    const named: Record<string, string> = { "&amp;":"&", "&lt;":"<", "&gt;":">", "&quot;":'"', "&apos;":"'" };
    if (named[entity] !== undefined) return named[entity]!;
    const hex = entity.startsWith("&#x");
    const point = Number.parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
    if (!Number.isInteger(point) || point <= 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) throw new Error("Invalid XML character reference.");
    return String.fromCodePoint(point);
  });
}

function nodeText(nodes: readonly XmlNode[]): string {
  let result = "";
  for (const node of nodes) if (typeof node["#text"] === "string") result += decodeXml(node["#text"]);
  return result;
}

class OfficePackage {
  private remaining = MAX_XML_BYTES;
  private constructor(private readonly zip: JSZip) {}
  static async open(buffer: Buffer): Promise<OfficePackage> {
    const zip = await JSZip.loadAsync(buffer);
    if (Object.keys(zip.files).length > 2048) throw new Error("Office archive contains too many entries.");
    return new OfficePackage(zip);
  }
  async xml(path: string, optional = false): Promise<XmlNode[]> {
    const entry = this.zip.file(path);
    if (!entry) {
      if (optional) return [];
      throw new Error("Office document part missing: " + path);
    }
    const chunks: Buffer[] = [];
    const stream = new Readable().wrap(entry.nodeStream("nodebuffer"));
    for await (const chunk of stream) {
      if (!Buffer.isBuffer(chunk)) throw new Error("Office archive did not return binary XML bytes.");
      this.remaining -= chunk.length;
      if (this.remaining < 0) throw new Error("Office XML exceeds the decompressed size limit.");
      chunks.push(chunk);
    }
    const text = decodeDocumentText(Buffer.concat(chunks));
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) throw new Error("Office XML must not contain DTD or entity declarations.");
    if (XMLValidator.validate(text) !== true) throw new Error("Invalid Office XML: " + path);
    return parser.parse(text) as XmlNode[];
  }
}

function outputBuffer() {
  const lines: string[] = [];
  let size = 0;
  return {
    add(line: string) {
      size += line.length + 1;
      if (size > MAX_OUTPUT_CHARS) throw new Error("Office extracted text exceeds the output limit.");
      lines.push(line);
    },
    finish: () => lines.join("\n").trim(),
  };
}

function paragraphText(nodes: readonly XmlNode[]): string {
  let text = "";
  for (const node of nodes) {
    if (node.del || node.moveFrom || node.pPr || node.rPr || node.instrText) continue;
    if (node.t) text += nodeText(children(node, "t"));
    else if (node.tab) text += "\t";
    else if (node.br || node.cr) text += "\n";
    else for (const [key, value] of Object.entries(node)) {
      if (key !== ":@" && Array.isArray(value)) text += paragraphText(value as XmlNode[]);
    }
  }
  return text;
}

function documentBlocks(nodes: readonly XmlNode[], add: (line: string) => void): void {
  for (const node of nodes) {
    if (node.p) {
      const body = children(node, "p");
      const style = elements(children(elements(body, "pPr")[0] ?? {}, "pPr"), "pStyle")[0];
      const heading = /^Heading([1-6])$/i.exec(attrs(style ?? {})["@_val"] ?? "");
      const text = paragraphText(body);
      if (text.trim()) add((heading ? "#".repeat(Number(heading[1])) + " " : "") + text + "\n");
    } else if (node.tbl) {
      for (const row of elements(children(node,"tbl"),"tr")) {
        const cells = elements(children(row,"tr"),"tc").map(cell => {
          const parts: string[] = [];
          documentBlocks(children(cell,"tc"), line => parts.push(line.trim()));
          return parts.join(" / ").replace(/\t/g," ").replace(/\r?\n/g," ");
        });
        add(cells.join("\t"));
      }
      add("");
    } else if (!node.del && !node.moveFrom) {
      for (const [key, value] of Object.entries(node)) {
        if (["sdt","sdtContent","customXml","ins","moveTo"].includes(key) && Array.isArray(value)) documentBlocks(value as XmlNode[],add);
      }
    }
  }
}

export async function extractDocx(buffer: Buffer): Promise<string> {
  const archive = await OfficePackage.open(buffer);
  const xml = await archive.xml("word/document.xml");
  const body = elements(children(elements(xml,"document")[0] ?? {},"document"),"body")[0];
  if (!body) throw new Error("DOCX has no main document body.");
  const output = outputBuffer();
  documentBlocks(children(body,"body"),output.add);
  return output.finish();
}

function richText(nodes: readonly XmlNode[]): string {
  return nodes.map(node => node.t ? nodeText(children(node,"t")) : node.r ? richText(children(node,"r")) : "").join("");
}

export async function extractXlsx(buffer: Buffer): Promise<string> {
  const archive = await OfficePackage.open(buffer);
  const workbook = elements(await archive.xml("xl/workbook.xml"),"workbook")[0] ?? {};
  const relationships = elements(await archive.xml("xl/_rels/workbook.xml.rels"),"Relationships")[0] ?? {};
  const targets = new Map(elements(children(relationships,"Relationships"),"Relationship").filter(node =>
    attrs(node)["@_TargetMode"] !== "External" && attrs(node)["@_Type"]?.endsWith("/worksheet")
  ).map(node => [attrs(node)["@_Id"], decodeXml(attrs(node)["@_Target"] ?? "")]));
  const shared = elements(await archive.xml("xl/sharedStrings.xml",true),"sst")[0] ?? {};
  const strings = elements(children(shared,"sst"),"si").map(node=>richText(children(node,"si")));
  const sheets = elements(children(elements(children(workbook,"workbook"),"sheets")[0] ?? {},"sheets"),"sheet");
  const output = outputBuffer();
  for (const sheet of sheets) {
    const name = decodeXml(attrs(sheet)["@_name"] ?? "Sheet");
    const target = targets.get(attrs(sheet)["@_id"]);
    if (!target) continue;
    const path = posix.normalize(target.startsWith("/") ? target.slice(1) : posix.join("xl",target));
    if (!path.startsWith("xl/") || path.includes("\\") || !path.endsWith(".xml")) throw new Error("Invalid worksheet part path.");
    const ws = elements(await archive.xml(path),"worksheet")[0] ?? {};
    const data = elements(children(ws,"worksheet"),"sheetData")[0] ?? {};
    output.add("# " + name);
    for (const row of elements(children(data,"sheetData"),"row")) {
      const cells: string[] = [];
      let rowChars = 0;
      for (const cell of elements(children(row,"row"),"c")) {
        const info = attrs(cell), body = children(cell,"c");
        const raw = nodeText(children(elements(body,"v")[0] ?? {},"v"));
        const formula = nodeText(children(elements(body,"f")[0] ?? {},"f"));
        const inline = elements(body,"is")[0];
        if (info["@_t"] === "s" && (!/^\d+$/.test(raw) || strings[Number(raw)] === undefined)) throw new Error("Invalid XLSX shared-string reference.");
        let value = info["@_t"] === "s" ? strings[Number(raw)]! : info["@_t"] === "inlineStr" ? richText(children(inline ?? {},"is")) : info["@_t"] === "b" ? (raw === "1" ? "TRUE" : "FALSE") : raw;
        if (formula) value = "=" + formula + (value ? " [cached: " + value + "]" : " [no cached value]");
        if (value) {
          const rendered = (info["@_r"] ?? "?") + "=" + JSON.stringify(value);
          rowChars += rendered.length + 1;
          if (rowChars > MAX_OUTPUT_CHARS) throw new Error("Worksheet row exceeds the output limit.");
          cells.push(rendered);
        }
      }
      if (cells.length) output.add(cells.join("\t"));
    }
    output.add("");
  }
  const result = output.finish();
  if (!result) throw new Error("XLSX has no readable worksheet content.");
  return result;
}
