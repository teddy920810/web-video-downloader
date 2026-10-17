import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountAuth } from './service';

let pg: PGlite;
let auth: AccountAuth;
let sent: { to: string; code: string }[];
describe('shared verified identity and email sessions', () => {
  beforeAll(async () => {
    pg = new PGlite();
    for (const name of (await readdir('db/migrations')).filter(n => n.endsWith('.sql')).sort()) {
      await pg.exec(await readFile(`db/migrations/${name}`, 'utf8'));
    }
  }, 30000);
  afterAll(async () => pg?.close());
  beforeEach(async () => {
    await pg.exec('TRUNCATE tool_accounts,streamnest_auth.email_challenges,streamnest_auth.rate_limits CASCADE');
    sent = [];
    auth = new AccountAuth({ query: async <T extends Record<string, unknown>>(sql: string, values?: unknown[]) => (await pg.query<T>(sql, values)).rows },
      'test-email-secret-with-at-least-thirty-two-characters', async (to, code) => { sent.push({ to, code }); });
  });
  it('keeps a verified Google identity and OTP login on the same existing account without issuing a second wallet', async () => {
    await pg.exec("INSERT INTO tool_accounts(user_id,email) VALUES ('existing','one@example.test'); INSERT INTO credit_wallets(user_id,free_credits) VALUES ('existing',19)");
    expect(await auth.link({ id: 'new-google-id', email: 'ONE@example.test', emailVerified: true, name: 'One' })).toBe('existing');
    const { challengeId } = await auth.send('one@example.test', '127.0.0.1');
    const result = await auth.verify(challengeId, sent[0].code);
    expect(result.user.id).toBe('existing');
    expect((await auth.session(result.token))?.user.id).toBe('existing');
    expect((await pg.query('SELECT * FROM credit_wallets')).rows).toHaveLength(1);
    expect((await pg.query<{free_credits:number}>('SELECT free_credits FROM credit_wallets')).rows[0].free_credits).toBe(19);
  });
  it('does not link unverified email and selects one existing paid history without merging historical rows', async () => {
    await expect(auth.link({ id:'unknown',email:'one@example.test',emailVerified:false })).rejects.toThrow();
    await pg.exec("INSERT INTO tool_accounts(user_id,email) VALUES ('old','one@example.test'),('paid','one@example.test'); INSERT INTO credit_wallets(user_id) VALUES ('old'),('paid')");
    await pg.query("INSERT INTO billing_orders(id,user_id,mode,offer_key,product_id,status) VALUES($1,'paid','live','pro-monthly-500','prod_one','paid')", [crypto.randomUUID()]);
    expect(await auth.link({ id:'new',email:'one@example.test',emailVerified:true })).toBe('paid');
    expect((await pg.query('SELECT * FROM tool_accounts')).rows).toHaveLength(2);
  });
  it('consumes an OTP once and locks the challenge after five wrong guesses', async () => {
    const {challengeId} = await auth.send('one@example.test','127.0.0.1');
    for(let i=0;i<5;i++) await expect(auth.verify(challengeId,'invalid')).rejects.toThrow();
    await expect(auth.verify(challengeId,sent[0].code)).rejects.toThrow();
    const next=await auth.send('two@example.test','127.0.0.1');
    await auth.verify(next.challengeId,sent[1].code);
    await expect(auth.verify(next.challengeId,sent[1].code)).rejects.toThrow();
  });
  it('selects an internally entitled account over a newer free Google account without moving balances', async () => {
    await pg.exec(`INSERT INTO tool_accounts(user_id,email,plan_id) VALUES('gifted','one@example.test','pro'),('google-new','one@example.test','free');
      INSERT INTO credit_wallets(user_id,free_credits,paid_credits) VALUES('gifted',0,500),('google-new',1,0);`);
    await pg.query(`INSERT INTO credit_batches(user_id,mode,payment_key,kind,granted,remaining,price_cents,paid_at,starts_at,expires_at)
      VALUES('gifted','live','internal:fixture','pro',500,500,0,now(),now(),now()+interval '30 days')`);
    expect(await auth.link({id:'google-new',email:'ONE@example.test',emailVerified:true})).toBe('gifted');
    expect(await auth.canonical('one@example.test')).toBe('gifted');
    expect(await auth.link({id:'another-google-id',email:'one@example.test',emailVerified:true})).toBe('gifted');
    expect((await pg.query('SELECT user_id,free_credits,paid_credits FROM credit_wallets ORDER BY user_id')).rows).toEqual([
      {user_id:'gifted',free_credits:0,paid_credits:500}, {user_id:'google-new',free_credits:1,paid_credits:0},
    ]);
  });
  it('requires review when two same-email accounts have active monthly entitlements', async () => {
    await pg.exec(`INSERT INTO tool_accounts(user_id,email) VALUES('first','one@example.test'),('second','one@example.test');
      INSERT INTO credit_wallets(user_id) VALUES('first'),('second');`);
    for (const user of ['first','second']) await pg.query(`INSERT INTO credit_batches(user_id,mode,payment_key,kind,granted,remaining,paid_at,starts_at,expires_at)
      VALUES($1,'live',$2,'pro',500,500,now(),now(),now()+interval '30 days')`, [user,'internal:'+user]);
    await expect(auth.link({id:'second',email:'one@example.test',emailVerified:true})).rejects.toThrow('account_link_review_required');
    expect(await auth.canonical('one@example.test')).toBeNull();
  });
  it('limits resends and expires/revokes real sessions on the server', async () => {
    const {challengeId}=await auth.send('one@example.test','127.0.0.1');
    await expect(auth.send('one@example.test','127.0.0.1')).rejects.toThrow('rate_limited');
    const result=await auth.verify(challengeId,sent[0].code);
    await auth.signOut(result.token);
    expect(await auth.session(result.token)).toBeNull();
    expect(await auth.session('forged')).toBeNull();
  });
  it('does not deliver or accept a usable code when the provider fails', async () => {
    auth=new AccountAuth({query:async <T extends Record<string, unknown>>(sql:string,values?:unknown[])=>(await pg.query<T>(sql,values)).rows},
      'test-email-secret-with-at-least-thirty-two-characters',async()=>{throw new Error('provider failed');});
    await expect(auth.send('one@example.test','127.0.0.1')).rejects.toThrow('email_unavailable');
    expect((await pg.query('SELECT * FROM streamnest_auth.email_challenges WHERE invalidated_at IS NULL')).rows).toHaveLength(0);
  });
});
