CREATE TABLE IF NOT EXISTS tool_accounts (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  plan_id TEXT NOT NULL DEFAULT 'free' CHECK (plan_id IN ('free', 'pro')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_wallets (
  user_id TEXT PRIMARY KEY REFERENCES tool_accounts(user_id) ON DELETE CASCADE,
  free_credits INTEGER NOT NULL DEFAULT 1 CHECK (free_credits >= 0),
  paid_credits INTEGER NOT NULL DEFAULT 0 CHECK (paid_credits >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES tool_accounts(user_id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  free_credits INTEGER NOT NULL CHECK (free_credits >= 0),
  paid_credits INTEGER NOT NULL CHECK (paid_credits >= 0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'consumed', 'refunded')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS credit_reservations_user_created_idx
  ON credit_reservations(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES tool_accounts(user_id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES credit_reservations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('grant', 'reserve', 'consume', 'refund')),
  free_delta INTEGER NOT NULL DEFAULT 0,
  paid_delta INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tool_usage (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES tool_accounts(user_id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL,
  reservation_id UUID REFERENCES credit_reservations(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
  credits INTEGER NOT NULL DEFAULT 0,
  size_bytes BIGINT,
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tool_usage_user_created_idx ON tool_usage(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION reserve_tool_credits(
  p_user_id TEXT,
  p_tool_id TEXT,
  p_amount INTEGER,
  p_idempotency_key TEXT
) RETURNS TABLE (
  id UUID,
  status TEXT,
  amount INTEGER,
  free_credits INTEGER,
  paid_credits INTEGER
) LANGUAGE plpgsql AS $$
DECLARE
  v_wallet credit_wallets%ROWTYPE;
  v_free INTEGER;
  v_paid INTEGER;
BEGIN
  SELECT * INTO v_wallet FROM credit_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY SELECT r.id, r.status, r.amount, r.free_credits, r.paid_credits
    FROM credit_reservations r WHERE r.idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN; END IF;

  IF v_wallet.free_credits + v_wallet.paid_credits < p_amount THEN RETURN; END IF;
  v_free := LEAST(v_wallet.free_credits, p_amount);
  v_paid := p_amount - v_free;

  UPDATE credit_wallets AS w
    SET free_credits = w.free_credits - v_free,
        paid_credits = w.paid_credits - v_paid,
        updated_at = NOW()
    WHERE w.user_id = p_user_id;

  RETURN QUERY
    INSERT INTO credit_reservations(user_id, tool_id, amount, free_credits, paid_credits, idempotency_key)
    VALUES (p_user_id, p_tool_id, p_amount, v_free, v_paid, p_idempotency_key)
    RETURNING credit_reservations.id, credit_reservations.status, credit_reservations.amount,
      credit_reservations.free_credits, credit_reservations.paid_credits;

  INSERT INTO credit_ledger(user_id, reservation_id, event_type, free_delta, paid_delta)
    SELECT p_user_id, r.id, 'reserve', -v_free, -v_paid
    FROM credit_reservations r WHERE r.idempotency_key = p_idempotency_key;
END;
$$;

CREATE OR REPLACE FUNCTION consume_tool_credits(p_reservation_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_row credit_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM credit_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND OR v_row.status <> 'reserved' THEN RETURN; END IF;
  UPDATE credit_reservations SET status = 'consumed', updated_at = NOW() WHERE id = p_reservation_id;
  INSERT INTO credit_ledger(user_id, reservation_id, event_type)
    VALUES (v_row.user_id, v_row.id, 'consume');
END;
$$;

CREATE OR REPLACE FUNCTION refund_tool_credits(p_reservation_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_row credit_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM credit_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND OR v_row.status <> 'reserved' THEN RETURN; END IF;
  UPDATE credit_wallets
    SET free_credits = free_credits + v_row.free_credits,
        paid_credits = paid_credits + v_row.paid_credits,
        updated_at = NOW()
    WHERE user_id = v_row.user_id;
  UPDATE credit_reservations SET status = 'refunded', updated_at = NOW() WHERE id = p_reservation_id;
  INSERT INTO credit_ledger(user_id, reservation_id, event_type, free_delta, paid_delta)
    VALUES (v_row.user_id, v_row.id, 'refund', v_row.free_credits, v_row.paid_credits);
END;
$$;
