import JSZip from "jszip";

export const DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const PACKAGE_RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_RELS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const SHEET = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

function xmlText(text: string): string {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(text)) throw new Error("Text contains characters unsupported by Office XML.");
  return text.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;");
}

function relationships(items: readonly { id: string; type: string; target: string }[]): string {
  return XML + '<Relationships xmlns="'+PACKAGE_RELS+'">'+items.map(item=>
    '<Relationship Id="'+item.id+'" Type="'+OFFICE_RELS+'/'+item.type+'" Target="'+item.target+'"/>'
  ).join("")+'</Relationships>';
}

function contentTypes(parts: readonly {path:string;type:string}[]): string {
  return XML+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    +'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    +'<Default Extension="xml" ContentType="application/xml"/>'
    +parts.map(part=>'<Override PartName="/'+part.path+'" ContentType="'+part.type+'"/>').join("")+'</Types>';
}

function wordParagraph(text:string,heading?:number):string {
  return '<w:p>'+(heading?'<w:pPr><w:pStyle w:val="Heading'+heading+'"/></w:pPr>':'')
    +'<w:r><w:t xml:space="preserve">'+xmlText(text)+'</w:t></w:r></w:p>';
}

function tableCells(line:string):string[] {
  return line.trim().replace(/^\|/,"").replace(/\|$/,"").split("|").map(cell=>cell.trim());
}

function markdownBody(markdown:string):string {
  const lines=markdown.replace(/\r\n?/g,"\n").split("\n");
  const body:string[]=[];
  let fenced=false;
  for(let i=0;i<lines.length;i++){
    const line=lines[i]!;
    if(/^\s*(?:\x60{3,}|~{3,})/.test(line)){fenced=!fenced;body.push(wordParagraph(line));continue;}
    const heading=!fenced?/^(#{1,6})\s+(.+)$/.exec(line):null;
    if(heading){body.push(wordParagraph(heading[2]!,heading[1]!.length));continue;}
    const divider=lines[i+1];
    if(!fenced&&line.includes("|")&&divider&&divider.includes("|")&&tableCells(divider).every(cell=>/^:?-{3,}:?$/.test(cell))){
      const rows=[tableCells(line)];i++;
      while(i+1<lines.length&&lines[i+1]!.includes("|")&&lines[i+1]!.trim())rows.push(tableCells(lines[++i]!));
      body.push('<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>'
        +["top","left","bottom","right","insideH","insideV"].map(side=>'<w:'+side+' w:val="single" w:sz="4" w:color="B8C1CC"/>').join("")
        +'</w:tblBorders></w:tblPr><w:tblGrid>'+rows[0]!.map(()=>'<w:gridCol w:w="2400"/>').join("")+'</w:tblGrid>'
        +rows.map(row=>'<w:tr>'+row.map(cell=>'<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>'+wordParagraph(cell)+'</w:tc>').join("")+'</w:tr>').join("")+'</w:tbl>');
      continue;
    }
    body.push(wordParagraph(line));
  }
  return body.join("");
}

export async function exportMarkdownDocx(markdown:string):Promise<Buffer>{
  const zip=new JSZip();
  zip.file("[Content_Types].xml",contentTypes([
    {path:"word/document.xml",type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"},
    {path:"word/styles.xml",type:"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"},
  ]));
  zip.file("_rels/.rels",relationships([{id:"rId1",type:"officeDocument",target:"word/document.xml"}]));
  zip.file("word/_rels/document.xml.rels",relationships([{id:"rId1",type:"styles",target:"styles.xml"}]));
  zip.file("word/styles.xml",XML+'<w:styles xmlns:w="'+WORD+'"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:sz w:val="22"/></w:rPr></w:style>'
    +Array.from({length:6},(_,i)=>'<w:style w:type="paragraph" w:styleId="Heading'+(i+1)+'"><w:name w:val="heading '+(i+1)+'"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="'+i+'"/></w:pPr><w:rPr><w:b/><w:sz w:val="'+Math.max(24,36-i*2)+'"/></w:rPr></w:style>').join("")+'</w:styles>');
  zip.file("word/document.xml",XML+'<w:document xmlns:w="'+WORD+'"><w:body>'+markdownBody(markdown)
    +'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>');
  return zip.generateAsync({type:"nodebuffer",compression:"DEFLATE"});
}

function columnAddress(index:number):string{
  let value=index+1,name="";
  while(value){value--;name=String.fromCharCode(65+value%26)+name;value=Math.floor(value/26);}
  return name;
}
function cellXml(value:unknown,address:string):string{
  if(value===null||value===undefined)return "";
  if(typeof value==="number"){
    if(!Number.isFinite(value))throw new Error("Spreadsheet numbers must be finite.");
    return '<c r="'+address+'"><v>'+value+'</v></c>';
  }
  if(typeof value==="boolean")return '<c r="'+address+'" t="b"><v>'+(value?1:0)+'</v></c>';
  const text=typeof value==="string"?value:JSON.stringify(value);
  if(text.length>32767)throw new Error("Spreadsheet cell exceeds Excel's 32767-character limit.");
  // Strings beginning with = remain strings, never executable formulas.
  return '<c r="'+address+'" t="inlineStr"><is><t xml:space="preserve">'+xmlText(text)+'</t></is></c>';
}

export async function exportRecordsXlsx(value:unknown,sheetName="Data"):Promise<Buffer>{
  if(!Array.isArray(value)||value.length===0||value.some(row=>!row||typeof row!=="object"||Array.isArray(row)))
    throw new Error("XLSX export requires a nonempty JSON array of records.");
  const records=value as Record<string,unknown>[];
  const columns=[...new Set(records.flatMap(row=>Object.keys(row)))];
  if(!columns.length||columns.length>16384||records.length>=1048576)throw new Error("Records exceed supported Excel worksheet dimensions.");
  const safeName=sheetName.replace(/[\[\]:*?\/\\]/g," ").trim().slice(0,31).replace(/^'+|'+$/g,"")||"Data";
  const zip=new JSZip();
  zip.file("[Content_Types].xml",contentTypes([
    {path:"xl/workbook.xml",type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"},
    {path:"xl/worksheets/sheet1.xml",type:"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"},
  ]));
  zip.file("_rels/.rels",relationships([{id:"rId1",type:"officeDocument",target:"xl/workbook.xml"}]));
  zip.file("xl/_rels/workbook.xml.rels",relationships([{id:"rId1",type:"worksheet",target:"worksheets/sheet1.xml"}]));
  zip.file("xl/workbook.xml",XML+'<workbook xmlns="'+SHEET+'" xmlns:r="'+OFFICE_RELS+'"><sheets><sheet name="'+xmlText(safeName)+'" sheetId="1" r:id="rId1"/></sheets></workbook>');
  const rows=['<row r="1">'+columns.map((key,i)=>cellXml(key,columnAddress(i)+"1")).join("")+'</row>'];
  for(const [index,record] of records.entries()){
    const row=index+2;
    rows.push('<row r="'+row+'">'+columns.map((key,i)=>cellXml(Object.hasOwn(record,key)?record[key]:undefined,columnAddress(i)+row)).join("")+'</row>');
  }
  zip.file("xl/worksheets/sheet1.xml",XML+'<worksheet xmlns="'+SHEET+'"><sheetData>'+rows.join("")+'</sheetData></worksheet>');
  return zip.generateAsync({type:"nodebuffer",compression:"DEFLATE"});
}
