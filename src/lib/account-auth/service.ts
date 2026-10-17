import { createHash, createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { QueryDatabase } from '../billing/service';

export type VerifiedProfile = { id: string; email: string; emailVerified: boolean; name?: string | null; image?: string | null };
type SessionRow = Record<string, unknown> & { user_id: string; email: string; display_name: string | null; avatar_url: string | null; expires_at: string };
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
export class AccountAuth {
  constructor(private db: QueryDatabase, private secret: string, private deliver: (to: string, code: string) => Promise<void>) {
    if(secret.length<32)throw new Error('Email authentication unavailable.');
  }
  async link(profile: VerifiedProfile): Promise<string> {
    if(!profile.emailVerified)throw new Error('verified_email_required');
    const [r]=await this.db.query('SELECT streamnest_auth.link_identity($1,$2,$3,$4) AS id',
      [profile.id,profile.email.trim().toLowerCase(),profile.name??null,profile.image??null]);
    if(!r?.id)throw new Error('account_link_unavailable');
    return String(r.id);
  }
  async canonical(email: string): Promise<string | null> {
    const [r]=await this.db.query('SELECT user_id FROM streamnest_auth.identities WHERE email=$1',[email.trim().toLowerCase()]);
    return r ? String(r.user_id) : null;
  }
  async send(input: string, ip: string) {
    const email=input.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new Error('invalid_email');
    for(const [key,limit,seconds] of [[`email:${email}`,1,60],[`ip:${ip}`,10,600]] as const) {
      const hashed=createHmac('sha256',this.secret).update(key).digest('hex');
      if(!(await this.db.query('SELECT streamnest_auth.take_rate($1,$2,$3) AS ok',[hashed,limit,seconds]))[0]?.ok)throw new Error('rate_limited');
    }
    const challengeId=randomUUID(),code=String(randomInt(0,1_000_000)).padStart(6,'0');
    await this.db.query('INSERT INTO streamnest_auth.email_challenges(id,email,code_hash) VALUES($1,$2,$3)',
      [challengeId,email,this.codeHash(challengeId,code)]);
    try {await this.deliver(email,code);}catch {
      await this.db.query('UPDATE streamnest_auth.email_challenges SET invalidated_at=now() WHERE id=$1',[challengeId]);
      throw new Error('email_unavailable');
    }
    return {challengeId,expiresIn:600,retryAfter:60};
  }
  private codeHash(id: string,code: string) {return createHmac('sha256',this.secret).update(`${id}:${code}`).digest('hex');}
  async verify(challengeId: string,code: string) {
    if(!/^[a-f0-9-]{36}$/i.test(challengeId)||typeof code!=='string'||code.length>100)throw new Error('invalid_code');
    const [r]=await this.db.query('SELECT streamnest_auth.consume_otp($1,$2) AS email',[challengeId,this.codeHash(challengeId,code)]);
    if(!r?.email)throw new Error('invalid_code');
    const email=String(r.email);
    const id=await this.link({id:randomUUID(),email,emailVerified:true,name:email.split('@')[0]});
    const token=randomBytes(32).toString('base64url');
    await this.db.query('INSERT INTO streamnest_auth.sessions(token_hash,user_id) VALUES($1,$2)',[sha(token),id]);
    const session=await this.session(token);
    if(!session)throw new Error('session_unavailable');
    return {...session,token};
  }
  async session(token: string) {
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
    const [r]=await this.db.query<SessionRow>(`SELECT s.user_id,s.expires_at,a.email,a.display_name,a.avatar_url
      FROM streamnest_auth.sessions s JOIN tool_accounts a ON a.user_id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL`,[sha(token)]);
    return r ? {user:{id:r.user_id,email:r.email,emailVerified:true,name:r.display_name??r.email.split('@')[0],image:r.avatar_url},
      session:{id:sha(token),userId:r.user_id,expiresAt:new Date(r.expires_at)}} : null;
  }
  async signOut(token: string) {await this.db.query('UPDATE streamnest_auth.sessions SET revoked_at=now() WHERE token_hash=$1',[sha(token)]);}
}
