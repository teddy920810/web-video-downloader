import { getSecret } from 'astro:env/server';
import { neon } from '@neondatabase/serverless';
import { createHmac } from 'node:crypto';
import { AccountAuth } from './service';

export const sharedAuthEnabled = () => getSecret('SHARED_AUTH_ENABLED') === 'true';
export const emailAvailable = () => sharedAuthEnabled() && getSecret('EMAIL_PROVIDER') === 'cloudflare' &&
  !!getSecret('CLOUDFLARE_EMAIL_API_TOKEN') && !!getSecret('CLOUDFLARE_EMAIL_ACCOUNT_ID') && !!getSecret('EMAIL_FROM');
export function emailCookieName(request: Request) { return new URL(request.url).protocol === 'https:' ? '__Host-sn_email_session' : 'sn_email_session'; }
export function emailToken(request: Request) {
  const name=emailCookieName(request);
  return request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1) ?? '';
}
export function emailCookie(request: Request,token: string,clear=false) {
  return `${emailCookieName(request)}=${clear?'':token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear?0:2592000}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
}
export function accountAuth() {
  const url=getSecret('DATABASE_URL'),secret=getSecret('BETTER_AUTH_SECRET');
  if(!sharedAuthEnabled()||!url||!secret)throw new Error('Shared authentication unavailable.');
  const sql=neon(url);
  const pepper=createHmac('sha256',secret).update('streamnest-email-auth-v1').digest('hex');
  return new AccountAuth({query:async <T extends Record<string,unknown>>(query:string,params?:unknown[])=>(await sql.query(query,params)) as T[]},pepper,
    async (to,code)=>{
      if(!emailAvailable())throw new Error('Email provider unavailable.');
      const account=getSecret('CLOUDFLARE_EMAIL_ACCOUNT_ID');
      if(!/^[a-f0-9]{32}$/i.test(account??''))throw new Error('Email provider unavailable.');
      // Provider contract: https://developers.cloudflare.com/email-service/get-started/send-emails/
      const result=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/email/sending/send`,{
        method:'POST',headers:{Authorization:`Bearer ${getSecret('CLOUDFLARE_EMAIL_API_TOKEN')}`,'Content-Type':'application/json'},
        body:JSON.stringify({to,from:getSecret('EMAIL_FROM'),subject:'Your Streamnest sign-in code',
          text:`Your Streamnest sign-in code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`}),
        signal:AbortSignal.timeout(15000),redirect:'error'});
      if(!result.ok)throw new Error('Email delivery failed.');
      const body=await result.json() as {success?:boolean};
      if(body.success!==true)throw new Error('Email delivery failed.');
    });
}
