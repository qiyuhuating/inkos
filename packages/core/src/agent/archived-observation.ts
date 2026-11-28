import type { AgentMessage } from "@mariozechner/pi-agent-core";

function object(value: unknown): value is Record<string,unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function digest(value:unknown): value is string {
  return typeof value==="string" && /^[a-f0-9]{64}$/.test(value);
}

function excerpt(text:string):string {
  let end=0,count=0;
  for(const scalar of text){if(count++===512)break;end+=scalar.length;}
  return text.slice(0,end);
}

/** Exact reference and bounded excerpt, shared by live and restored projection.
 * Never truncate a mutation, failure, or unaddressable observation. */
export function compactArchivedText(raw: Record<string,unknown>, text: string): string {
  const details=raw.details;
  if (raw.isError || !object(details)) return text;
  const reference=details.archivedResult;
  const page=details.archivedPage;
  if(!object(reference) && !object(page))return text;
  let value:unknown;
  try { value=JSON.parse(text); } catch(error) { if(error instanceof SyntaxError)return text; throw error; }
  if(!object(value))return text;
  if(object(reference) && digest(reference.id) && object(value.archivedResult)
    && value.archivedResult.id===reference.id && typeof value.preview==="string"){
    // Preserve the existing canonical historical representation.
    return JSON.stringify({status:value.status,archivedResult:{id:reference.id,bytes:reference.bytes,contentHash:reference.contentHash},facts:value.facts,
      excerpt:excerpt(value.preview),note:"Historical excerpt only. Recover exact original evidence with read_archived_tool_result from offset 0; do not infer a complete read."});
  }
  if(raw.toolName==="read_archived_tool_result" && object(page) && digest(page.id)
    && digest(page.contentHash) && typeof page.offset==="number" && Number.isSafeInteger(page.offset)
    && page.offset>=0 && typeof value.text==="string"){
    return JSON.stringify({archivedPage:{id:page.id,offset:page.offset,contentHash:page.contentHash},bytes:value.bytes,
      excerpt:excerpt(value.text),note:"Archived page excerpt only. Call read_archived_tool_result with the same id and offset to recover the exact page before relying on its omitted contents."});
  }
  return text;
}

/** Only successful read archives and exact archive pages qualify. */
export function compactArchivedObservation(message:AgentMessage):AgentMessage {
  if(message.role!=="toolResult" || message.isError || message.content.length!==1
    || message.content[0]?.type!=="text")return message;
  const details=message.details as Record<string,unknown>|undefined;
  const execution=details?.hostExecution as {risk?:unknown;status?:unknown}|undefined;
  if(!(execution?.risk==="read"&&execution.status==="success")
    && !(message.toolName==="read_archived_tool_result"&&object(details?.archivedPage)))return message;
  const text=compactArchivedText(message as unknown as Record<string,unknown>,message.content[0].text);
  if(text===message.content[0].text || text.length>=message.content[0].text.length)return message;
  const {displayText:_display,...facts}=details!;
  return {...message,content:[{type:"text",text}],details:facts};
}
