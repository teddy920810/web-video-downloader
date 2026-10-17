import type { APIRoute } from 'astro';
import { accountAuth, emailAvailable, emailCookie } from '../../../lib/account-auth/runtime';
import { json } from '../../../lib/api/response';

export const prerender = false;
export const POST: APIRoute = async ({request,params}) => {
  if(!['send-code','verify-code'].includes(params.action??''))return json({error:'not_found'},{status:404});
  if(!emailAvailable())return json({error:'Email sign-in is not available yet. Please use Google.'},{status:503});
  if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Same-origin JSON required.'},{status:403});
  try {
    const reader=request.body?.getReader();if(!reader)throw new Error('invalid_request');let size=0;const chunks:Uint8Array[]=[];
    for(;;){const c=await reader.read();if(c.done)break;size+=c.value.length;if(size>2048){await reader.cancel();return json({error:'Request too large.'},{status:413});}chunks.push(c.value);}
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string,unknown>;
    const service=accountAuth();
    if(params.action==='send-code') {
      if(typeof body.email!=='string')throw new Error('invalid_email');
      const result=await service.send(body.email,request.headers.get('x-vercel-forwarded-for')??request.headers.get('x-forwarded-for')?.split(',')[0]??'local');
      return json(result);
    }
    if(typeof body.challengeId!=='string'||typeof body.code!=='string')throw new Error('invalid_code');
    const result=await service.verify(body.challengeId,body.code);
    return json({user:result.user},{headers:{'Set-Cookie':emailCookie(request,result.token)}});
  }catch(error){
    const code=error instanceof Error?error.message:'';
    const status=code==='rate_limited'?429:['invalid_email','invalid_code','invalid_request'].includes(code)||error instanceof SyntaxError?400:503;
    return json({error:status===429?'Please wait before requesting another code.':status===400?'Check your email address or verification code.':'Email sign-in is temporarily unavailable.'},{status});
  }
};
