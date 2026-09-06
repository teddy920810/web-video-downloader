CREATE TABLE IF NOT EXISTS account_preferences (
  user_id TEXT PRIMARY KEY REFERENCES tool_accounts(user_id) ON DELETE CASCADE,
  nickname TEXT NOT NULL DEFAULT '' CHECK (length(nickname) <= 80),
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_updated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reward_codes (
  id UUID PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE CHECK (length(code_hash) = 64),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  credits INTEGER NOT NULL CHECK (credits BETWEEN 1 AND 1000),
  max_uses INTEGER NOT NULL CHECK (max_uses BETWEEN 1 AND 10000),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0 AND used_count <= max_uses),
  expires_at TIMESTAMPTZ NOT NULL,
  disabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS reward_redemptions (
  code_id UUID NOT NULL REFERENCES reward_codes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES tool_accounts(user_id) ON DELETE CASCADE,
  credits INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(code_id, user_id)
);
CREATE TABLE IF NOT EXISTS reward_attempt_limits (
  user_id TEXT PRIMARY KEY REFERENCES tool_accounts(user_id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS credit_ledger_user_created_idx ON credit_ledger(user_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION redeem_reward_code(p_user_id TEXT, p_hash TEXT)
RETURNS TABLE(outcome TEXT, awarded INTEGER) LANGUAGE plpgsql AS $$
DECLARE
  v_code reward_codes%ROWTYPE;
  v_limit reward_attempt_limits%ROWTYPE;
BEGIN
  -- Lock wallet first, consistently with existing credit-grant operations.
  PERFORM 1 FROM credit_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable'::TEXT, 0; RETURN; END IF;
  INSERT INTO reward_attempt_limits(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
  SELECT * INTO v_limit FROM reward_attempt_limits WHERE user_id = p_user_id;
  IF v_limit.window_start <= NOW() - INTERVAL '15 minutes' THEN
    UPDATE reward_attempt_limits SET window_start = NOW(), attempts = 0 WHERE user_id = p_user_id;
    v_limit.attempts := 0;
  END IF;
  IF v_limit.attempts >= 10 THEN RETURN QUERY SELECT 'rate_limited'::TEXT, 0; RETURN; END IF;
  UPDATE reward_attempt_limits SET attempts = attempts + 1 WHERE user_id = p_user_id;

  SELECT * INTO v_code FROM reward_codes WHERE code_hash = p_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'invalid'::TEXT, 0; RETURN; END IF;
  -- Duplicate success is checked before expiry/disable so a lost response is recoverable.
  IF EXISTS(SELECT 1 FROM reward_redemptions WHERE code_id = v_code.id AND user_id = p_user_id) THEN
    RETURN QUERY SELECT 'already_redeemed'::TEXT, 0; RETURN;
  END IF;
  IF v_code.disabled THEN RETURN QUERY SELECT 'disabled'::TEXT, 0; RETURN; END IF;
  IF v_code.expires_at <= NOW() THEN RETURN QUERY SELECT 'expired'::TEXT, 0; RETURN; END IF;
  IF v_code.used_count >= v_code.max_uses THEN RETURN QUERY SELECT 'exhausted'::TEXT, 0; RETURN; END IF;
  INSERT INTO reward_redemptions(code_id, user_id, credits) VALUES(v_code.id, p_user_id, v_code.credits);
  UPDATE reward_codes SET used_count = used_count + 1 WHERE id = v_code.id;
  UPDATE credit_wallets SET free_credits = free_credits + v_code.credits, updated_at = NOW() WHERE user_id = p_user_id;
  INSERT INTO credit_ledger(user_id, event_type, free_delta) VALUES(p_user_id, 'grant', v_code.credits);
  RETURN QUERY SELECT 'redeemed'::TEXT, v_code.credits;
END;
$$;
