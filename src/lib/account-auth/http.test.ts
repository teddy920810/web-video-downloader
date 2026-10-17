import { describe, expect, it } from 'vitest';
import { boundedJson } from './http';
describe('bounded login JSON',()=>{
  it('rejects and cancels a streamed oversized request without reading the remainder',async()=>{
    let canceled=false;
    const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(1500));},cancel(){canceled=true;}});
    const request=new Request('https://www.streamnest.io/api/desktop/approve',{method:'POST',body:stream,duplex:'half'} as RequestInit);
    await expect(boundedJson(request,1024)).rejects.toThrow('request_too_large');
    expect(canceled).toBe(true);
  });
  it('accepts only JSON objects',async()=>{
    for(const raw of ['null','[]','42','bad'])await expect(boundedJson(new Request('https://example.test',{method:'POST',body:raw}),100)).rejects.toThrow();
    expect(await boundedJson(new Request('https://example.test',{method:'POST',body:'{"ok":true}'}),100)).toEqual({ok:true});
  });
});
