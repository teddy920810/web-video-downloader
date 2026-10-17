import { beforeEach, describe, expect, it, vi } from 'vitest';
const deps=vi.hoisted(()=>({session:vi.fn(),link:vi.fn(),fetch:vi.fn(),enabled:true}));
vi.mock('astro:env/server',()=>({getSecret:(key:string)=>({DESKTOP_SERVICE_ORIGIN:'https://desktop.example.test',DESKTOP_BRIDGE_SECRET:'a'.repeat(48)})[key]}));
vi.mock('../../../lib/auth',()=>({getSession:deps.session}));
vi.mock('../../../lib/account-auth/runtime',()=>({sharedAuthEnabled:()=>deps.enabled,accountAuth:()=>({link:deps.link})}));
import {POST} from './[action]';
const requestId='523bb2e8-b215-41cf-b8bc-92cf7195e257';
const invoke=(body:unknown,origin='https://www.streamnest.io')=>POST({params:{action:'approve'},request:new Request('https://www.streamnest.io/api/desktop/approve',{
  method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)})} as never);
describe('desktop browser authorization bridge',()=>{
  beforeEach(()=>{vi.clearAllMocks();deps.enabled=true;vi.stubGlobal('fetch',deps.fetch);deps.session.mockResolvedValue({user:{id:'google',email:'one@example.test',emailVerified:true}});deps.link.mockResolvedValue('canonical');});
  it('requires same origin and a verified browser session before any authorization',async()=>{
    expect((await invoke({requestId},'https://attacker.test')).status).toBe(403);
    deps.session.mockResolvedValue({user:{emailVerified:false}});
    expect((await invoke({requestId})).status).toBe(401);
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it('sends a bounded, signed canonical account assertion server to server',async()=>{
    deps.fetch.mockResolvedValue(new Response(JSON.stringify({redirectUri:'http://127.0.0.1:51724/callback?code=one&state=two'})));
    expect((await invoke({requestId})).status).toBe(200);
    const [url,init]=deps.fetch.mock.calls[0];
    expect(url.href).toBe('https://desktop.example.test/internal/approve');
    const assertion=JSON.parse(init.body);const payload=JSON.parse(Buffer.from(assertion.payload,'base64url').toString());
    expect(payload.userId).toBe('canonical');expect(payload.emailVerified).toBe(true);expect(payload.aud).toBe('https://desktop.example.test');
    expect(assertion.signature).toHaveLength(43);expect(payload).not.toHaveProperty('email');
  });
  it('rejects a remote callback even if the downstream response is successful',async()=>{
    deps.fetch.mockResolvedValue(new Response(JSON.stringify({redirectUri:'https://attacker.test/callback'})));
    expect((await invoke({requestId})).status).toBe(503);
  });
  it('does not expose new behavior when disabled and rejects malformed requests',async()=>{
    deps.enabled=false;expect((await invoke({requestId})).status).toBe(404);
    deps.enabled=true;expect((await invoke({requestId:'bad'})).status).toBe(400);
  });
});
