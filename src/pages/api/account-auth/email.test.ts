import {beforeEach,describe,expect,it,vi} from 'vitest';
const deps=vi.hoisted(()=>({send:vi.fn(),verify:vi.fn(),enabled:true}));
vi.mock('../../../lib/account-auth/runtime',()=>({emailAvailable:()=>deps.enabled,accountAuth:()=>({send:deps.send,verify:deps.verify}),emailCookie:()=> '__Host-sn_email_session=opaque; Secure; HttpOnly; Path=/; SameSite=Lax'}));
import {POST} from './[action]';
const call=(action:string,body:unknown,origin='https://www.streamnest.io')=>POST({params:{action},request:new Request('https://www.streamnest.io/api/account-auth/'+action,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)})} as never);
describe('shared email login HTTP boundary',()=>{
  beforeEach(()=>{vi.clearAllMocks();deps.enabled=true;});
  it('fails closed without configured delivery and requires same-origin JSON',async()=>{
    deps.enabled=false;expect((await call('send-code',{email:'one@example.test'})).status).toBe(503);
    deps.enabled=true;expect((await call('send-code',{email:'one@example.test'},'https://attacker.test')).status).toBe(403);
    expect(deps.send).not.toHaveBeenCalled();
  });
  it('never returns the OTP or session token in JSON and sets a secure session cookie',async()=>{
    deps.send.mockResolvedValue({challengeId:'opaque',expiresIn:600});
    expect(await (await call('send-code',{email:'one@example.test'})).json()).not.toHaveProperty('code');
    deps.verify.mockResolvedValue({user:{id:'existing'},token:'secret-token'});
    const response=await call('verify-code',{challengeId:'id',code:'123456'});
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');expect(await response.json()).toEqual({user:{id:'existing'}});
  });
  it('returns safe rate-limit and invalid-code errors',async()=>{
    deps.send.mockRejectedValue(new Error('rate_limited'));expect((await call('send-code',{email:'one@example.test'})).status).toBe(429);
    deps.verify.mockRejectedValue(new Error('invalid_code'));expect((await call('verify-code',{challengeId:'id',code:'wrong'})).status).toBe(400);
  });
});
