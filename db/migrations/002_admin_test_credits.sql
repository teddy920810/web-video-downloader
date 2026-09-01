CREATE TABLE IF NOT EXISTS test_credit_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES tool_accounts(user_id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 5),
  idempotency_key UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS test_credit_grants_user_created_idx
  ON test_credit_grants(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION grant_test_credits(
  p_user_id TEXT,
  p_amount INTEGER,
  p_idempotency_key UUID
) RETURNS TABLE (free_credits INTEGER, paid_credits INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  v_grant test_credit_grants%ROWTYPE;
BEGIN
  IF p_amount < 1 OR p_amount > 5 THEN
    RAISE EXCEPTION 'invalid test credit amount';
  END IF;

  PERFORM 1 FROM credit_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet not found'; END IF;

  SELECT * INTO v_grant
    FROM test_credit_grants
    WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_grant.user_id <> p_user_id OR v_grant.amount <> p_amount THEN
      RAISE EXCEPTION 'idempotency key conflict';
    END IF;
  ELSE
    INSERT INTO test_credit_grants(user_id, amount, idempotency_key)
      VALUES (p_user_id, p_amount, p_idempotency_key);
    UPDATE credit_wallets AS wallet
      SET free_credits = wallet.free_credits + p_amount, updated_at = NOW()
      WHERE wallet.user_id = p_user_id;
    INSERT INTO credit_ledger(user_id, event_type, free_delta)
      VALUES (p_user_id, 'grant', p_amount);
  END IF;

  RETURN QUERY SELECT wallet.free_credits, wallet.paid_credits
    FROM credit_wallets AS wallet WHERE wallet.user_id = p_user_id;
END;
$$;
