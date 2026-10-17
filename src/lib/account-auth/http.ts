export async function boundedJson(request:Request,limit:number):Promise<Record<string,unknown>> {
  const reader=request.body?.getReader();if(!reader)throw new Error('invalid_request');
  let length=0;const chunks:Uint8Array[]=[];
  for(;;){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.byteLength;
    if(length>limit){await reader.cancel();throw new Error('request_too_large');}chunks.push(chunk.value);}
  const value:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('invalid_request');
  return value as Record<string,unknown>;
}
