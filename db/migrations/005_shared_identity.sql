-- Additive shared login persistence. Existing account rows, wallets and billing functions are untouched.
CREATE SCHEMA IF NOT EXISTS streamnest_auth;
CREATE TABLE IF NOT EXISTS streamnest_auth.identities (
  email text PRIMARY KEY CHECK(email=lower(email)),
  user_id text NOT NULL UNIQUE REFERENCES tool_accounts(user_id) ON DELETE CASCADE,
  linked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS streamnest_auth.email_challenges (
  id uuid PRIMARY KEY,email text NOT NULL,code_hash text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
  attempts integer NOT NULL DEFAULT 0,consumed_at timestamptz,invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS streamnest_auth.sessions (
  token_hash text PRIMARY KEY,user_id text NOT NULL REFERENCES tool_accounts(user_id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS streamnest_auth.rate_limits (
  key text PRIMARY KEY,started_at timestamptz NOT NULL DEFAULT now(),attempts integer NOT NULL DEFAULT 1
);
CREATE OR REPLACE FUNCTION streamnest_auth.take_rate(p_key text,p_limit integer,p_seconds integer)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  INSERT INTO streamnest_auth.rate_limits(key) VALUES(p_key)
  ON CONFLICT(key) DO UPDATE SET
    attempts=CASE WHEN streamnest_auth.rate_limits.started_at<now()-make_interval(secs=>p_seconds) THEN 1 ELSE streamnest_auth.rate_limits.attempts+1 END,
    started_at=CASE WHEN streamnest_auth.rate_limits.started_at<now()-make_interval(secs=>p_seconds) THEN now() ELSE streamnest_auth.rate_limits.started_at END
  RETURNING attempts INTO n;
  RETURN n<=p_limit;
END $$;
CREATE OR REPLACE FUNCTION streamnest_auth.link_identity(p_subject text,p_email text,p_name text,p_image text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_id text; v_paid_count integer;
BEGIN
  p_email:=lower(p_email);
  -- Lock a stable email key even when the identity does not exist yet.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_email,74192));
  SELECT user_id INTO v_id FROM streamnest_auth.identities WHERE email=p_email;
  IF FOUND THEN RETURN v_id; END IF;
  -- Select an existing identity without merging rows or transferring balances.
  SELECT count(DISTINCT a.user_id) INTO v_paid_count FROM tool_accounts a JOIN billing_orders o ON o.user_id=a.user_id
    WHERE lower(a.email)=p_email AND o.mode='live' AND o.status='paid';
  IF v_paid_count>1 THEN RAISE EXCEPTION 'account_link_review_required'; END IF;
  IF v_paid_count=1 THEN
    SELECT a.user_id INTO v_id FROM tool_accounts a JOIN billing_orders o ON o.user_id=a.user_id
      WHERE lower(a.email)=p_email AND o.mode='live' AND o.status='paid' LIMIT 1;
  ELSE
    SELECT user_id INTO v_id FROM tool_accounts WHERE lower(email)=p_email
      ORDER BY (user_id=p_subject) DESC,created_at,user_id LIMIT 1;
  END IF;
  IF v_id IS NULL THEN
    v_id:=p_subject;
    INSERT INTO tool_accounts(user_id,email,display_name,avatar_url) VALUES(v_id,p_email,p_name,p_image);
    INSERT INTO credit_wallets(user_id) VALUES(v_id);
  END IF;
  INSERT INTO streamnest_auth.identities(email,user_id) VALUES(p_email,v_id);
  RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION streamnest_auth.consume_otp(p_id uuid,p_hash text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE r streamnest_auth.email_challenges%ROWTYPE;
BEGIN
  SELECT * INTO r FROM streamnest_auth.email_challenges WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR r.expires_at<=now() OR r.attempts>=5 OR r.consumed_at IS NOT NULL OR r.invalidated_at IS NOT NULL THEN RETURN NULL; END IF;
  UPDATE streamnest_auth.email_challenges SET attempts=attempts+1 WHERE id=p_id;
  IF r.code_hash<>p_hash THEN RETURN NULL; END IF;
  UPDATE streamnest_auth.email_challenges SET consumed_at=now() WHERE id=p_id;
  RETURN r.email;
END $$;
