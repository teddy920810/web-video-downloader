import type { APIRoute } from 'astro';
import { getSecret } from 'astro:env/server';
import { createHmac } from 'node:crypto';
import { getSession } from '../../../lib/auth';
import { accountAuth, sharedAuthEnabled } from '../../../lib/account-auth/runtime';
import { json } from '../../../lib/api/response';
import { boundedJson } from '../../../lib/account-auth/http';

export const prerender=false;
export const POST: APIRoute=async({request,params})=>{
  if(params.action!=='approve'||!sharedAuthEnabled())return json({error:'not_found'},{status:404});
  if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Same-origin JSON required.'},{status:403});
  try{
    const {requestId}=await boundedJson(request,1024);
    if(typeof requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(requestId))return json({error:'Invalid authorization request.'},{status:400});
    const session=await getSession(request);
    if(!session?.user.emailVerified)return json({error:'Sign in to authorize your desktop.'},{status:401});
    const origin=getSecret('DESKTOP_SERVICE_ORIGIN'),secret=getSecret('DESKTOP_BRIDGE_SECRET');
    if(!origin||new URL(origin).protocol!=='https:'||!secret||secret.length<32)throw new Error('Desktop unavailable.');
    const id=await accountAuth().link({...session.user,emailVerified:true});
    const payload=Buffer.from(JSON.stringify({requestId,userId:id,emailVerified:true,aud:origin,exp:Math.floor(Date.now()/1000)+60})).toString('base64url');
    const signature=createHmac('sha256',secret).update(payload).digest('base64url');
    const result=await fetch(new URL('/internal/approve',origin),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,signature}),signal:AbortSignal.timeout(15000),redirect:'error'});
    if(!result.ok)return json({error:'This authorization request expired. Start again in the desktop app.'},{status:400});
    const body=await result.json() as {redirectUri:string};
    const callback=new URL(body.redirectUri);
    if(callback.protocol!=='http:'||callback.hostname!=='127.0.0.1'||callback.pathname!=='/callback')throw new Error('Invalid callback.');
    return json({redirectUri:callback.href});
  }catch(error){return json({error:'Desktop authorization is temporarily unavailable.'},{status:error instanceof Error&&error.message==='request_too_large'?413:503});}
};
