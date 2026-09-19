-- All billing/credit mutations lock the wallet before reservations or batches.
CREATE TABLE IF NOT EXISTS billing_orders (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES tool_accounts(user_id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  offer_key TEXT NOT NULL,
  product_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','created','paid','expired')),
  replacement_id UUID REFERENCES billing_orders(id),
  checkout_id TEXT UNIQUE,
  customer_id TEXT,
  checkout_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS billing_orders_user_idx ON billing_orders(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS billing_events (
  mode TEXT NOT NULL, event_id TEXT NOT NULL, event_type TEXT NOT NULL,
  event_at TIMESTAMPTZ NOT NULL, action TEXT NOT NULL, processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(mode,event_id)
);
CREATE TABLE IF NOT EXISTS billing_subscriptions (
  mode TEXT NOT NULL, id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES tool_accounts(user_id) ON DELETE CASCADE,
  source_order UUID NOT NULL REFERENCES billing_orders(id), customer_id TEXT NOT NULL,
  product_id TEXT NOT NULL, status TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL, period_end TIMESTAMPTZ NOT NULL,
  last_event_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(mode,id)
);
CREATE TABLE IF NOT EXISTS billing_revocations (
  mode TEXT NOT NULL, payment_key TEXT NOT NULL, reason TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(mode,payment_key)
);
CREATE TABLE IF NOT EXISTS credit_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES tool_accounts(user_id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK(mode IN ('test','live','legacy')),
  payment_key TEXT NOT NULL, order_id UUID REFERENCES billing_orders(id), subscription_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('pro','pack','legacy')),
  granted INTEGER NOT NULL CHECK(granted > 0), remaining INTEGER NOT NULL CHECK(remaining >= 0),
  consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed >= 0),
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK(price_cents >= 0),
  paid_at TIMESTAMPTZ NOT NULL, starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ,
  UNIQUE(mode,payment_key), CHECK(remaining + consumed <= granted),
  CHECK(expires_at IS NULL OR expires_at > starts_at)
);
CREATE INDEX IF NOT EXISTS credit_batches_user_expiry_idx ON credit_batches(user_id,expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS credit_batches_subscription_period_idx ON credit_batches(mode,subscription_id,starts_at) WHERE kind='pro';
CREATE TABLE IF NOT EXISTS billing_cancellations (
  mode TEXT NOT NULL, subscription_id TEXT NOT NULL, completed_at TIMESTAMPTZ,
  PRIMARY KEY(mode,subscription_id)
);
CREATE TABLE IF NOT EXISTS credit_allocations (
  reservation_id UUID NOT NULL REFERENCES credit_reservations(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES credit_batches(id), amount INTEGER NOT NULL CHECK(amount > 0),
  PRIMARY KEY(reservation_id,batch_id)
);
ALTER TABLE credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_event_type_check;
ALTER TABLE credit_ledger ADD CONSTRAINT credit_ledger_event_type_check CHECK(event_type IN ('grant','reserve','consume','refund','expire','revoke'));

-- Preserve any pre-existing paid balance, including credits currently reserved.
INSERT INTO credit_batches(user_id,mode,payment_key,kind,granted,remaining,paid_at,starts_at)
  SELECT w.user_id,'legacy','legacy:' || w.user_id,'legacy', w.paid_credits + COALESCE(r.held,0),w.paid_credits,NOW(),NOW()
  FROM credit_wallets w LEFT JOIN (SELECT user_id,SUM(paid_credits)::int AS held FROM credit_reservations WHERE status='reserved' GROUP BY user_id) r ON r.user_id=w.user_id
  WHERE w.paid_credits + COALESCE(r.held,0) > 0
    AND NOT EXISTS(SELECT 1 FROM credit_batches b WHERE b.user_id=w.user_id)
  ON CONFLICT(mode,payment_key) DO NOTHING;
INSERT INTO credit_allocations(reservation_id,batch_id,amount)
  SELECT r.id,b.id,r.paid_credits FROM credit_reservations r JOIN credit_batches b ON b.user_id=r.user_id AND b.kind='legacy'
  WHERE r.status='reserved' AND r.paid_credits>0 AND NOT EXISTS(SELECT 1 FROM credit_allocations a WHERE a.reservation_id=r.id)
  ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION refresh_credit_wallet(p_user_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_expired INTEGER; v_pro BOOLEAN;
BEGIN
  PERFORM 1 FROM credit_wallets WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT COALESCE(SUM(remaining),0)::int INTO v_expired FROM credit_batches WHERE user_id=p_user_id AND remaining>0 AND expires_at<=NOW() AND revoked_at IS NULL;
  UPDATE credit_batches SET remaining=0 WHERE user_id=p_user_id AND expires_at<=NOW();
  IF v_expired>0 THEN INSERT INTO credit_ledger(user_id,event_type,paid_delta) VALUES(p_user_id,'expire',-v_expired); END IF;
  UPDATE credit_wallets SET paid_credits=(SELECT COALESCE(SUM(remaining),0)::int FROM credit_batches WHERE user_id=p_user_id AND revoked_at IS NULL AND starts_at<=NOW() AND (expires_at IS NULL OR expires_at>NOW())),updated_at=NOW() WHERE user_id=p_user_id;
  SELECT EXISTS(SELECT 1 FROM credit_batches WHERE user_id=p_user_id AND kind='pro' AND revoked_at IS NULL AND starts_at<=NOW() AND expires_at>NOW()) INTO v_pro;
  UPDATE tool_accounts SET plan_id=CASE WHEN v_pro THEN 'pro' ELSE 'free' END, status='active',updated_at=NOW() WHERE user_id=p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION apply_billing_event(e JSONB)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_order billing_orders%ROWTYPE; v_batch credit_batches%ROWTYPE; v_sub billing_subscriptions%ROWTYPE;
  v_mode TEXT := e->>'mode'; v_action TEXT := e->>'action'; v_key TEXT; v_user TEXT;
  v_revoked BOOLEAN; v_rows INTEGER;
BEGIN
  -- Serialize webhook reconciliation, including refund-before-grant races.
  -- Wallet-only tool operations do not acquire this lock.
  PERFORM pg_advisory_xact_lock(81412341);
  INSERT INTO billing_events(mode,event_id,event_type,event_at,action) VALUES(v_mode,e->>'eventId',e->>'eventType',(e->>'eventAt')::timestamptz,v_action) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows=0 THEN
    -- A previously ambiguous refund can later be confirmed by the provider.
    -- Permit only this monotonic correction; subsequent deliveries stay idempotent.
    UPDATE billing_events SET action='revoke',processed_at=NOW()
      WHERE mode=v_mode AND event_id=e->>'eventId' AND action='review'
      AND event_type='refund.created' AND e->>'eventType'='refund.created' AND v_action='revoke';
    GET DIAGNOSTICS v_rows=ROW_COUNT;
    IF v_rows=0 THEN RETURN 'duplicate'; END IF;
  END IF;
  IF v_action IN ('ignore','review') THEN RETURN v_action; END IF;
  IF v_action='revoke' THEN
    FOR v_key IN SELECT jsonb_array_elements_text(e->'paymentKeys') LOOP
      INSERT INTO billing_revocations(mode,payment_key,reason) VALUES(v_mode,v_key,COALESCE(e->>'status','refunded')) ON CONFLICT DO NOTHING;
    END LOOP;
    FOR v_user IN SELECT DISTINCT user_id FROM credit_batches WHERE mode=v_mode AND payment_key IN (SELECT jsonb_array_elements_text(e->'paymentKeys')) ORDER BY user_id LOOP
      PERFORM refresh_credit_wallet(v_user);
      FOR v_batch IN SELECT * FROM credit_batches WHERE user_id=v_user AND mode=v_mode AND payment_key IN (SELECT jsonb_array_elements_text(e->'paymentKeys')) AND revoked_at IS NULL LOOP
        INSERT INTO credit_ledger(user_id,event_type,paid_delta) VALUES(v_user,'revoke',-v_batch.remaining);
        UPDATE credit_batches SET revoked_at=NOW(),remaining=0 WHERE id=v_batch.id;
        IF v_batch.kind='pro' AND EXISTS(SELECT 1 FROM billing_subscriptions s WHERE s.mode=v_mode AND s.id=v_batch.subscription_id AND s.period_end<=v_batch.expires_at) THEN
          INSERT INTO billing_cancellations(mode,subscription_id) VALUES(v_mode,v_batch.subscription_id) ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;
      PERFORM refresh_credit_wallet(v_user);
    END LOOP;
    RETURN 'revoked';
  END IF;
  IF e->>'referenceId' IS NOT NULL THEN
    SELECT * INTO v_order FROM billing_orders WHERE id=(e->>'referenceId')::uuid AND mode=v_mode;
  ELSIF e->>'subscriptionId' IS NOT NULL THEN
    SELECT o.* INTO v_order FROM billing_orders o JOIN billing_subscriptions s ON s.source_order=o.id WHERE s.mode=v_mode AND s.id=e->>'subscriptionId';
  END IF;
  IF v_order.id IS NULL OR v_order.product_id<>e->>'productId' OR v_order.offer_key<>e->>'offer' THEN RAISE EXCEPTION 'billing order mismatch'; END IF;
  PERFORM refresh_credit_wallet(v_order.user_id);
  IF v_order.customer_id IS NOT NULL AND v_order.customer_id<>e->>'customerId' THEN RAISE EXCEPTION 'billing customer mismatch'; END IF;
  UPDATE billing_orders SET customer_id=e->>'customerId' WHERE id=v_order.id;
  IF e->>'checkoutId' IS NOT NULL THEN
    IF v_order.checkout_id IS NOT NULL AND v_order.checkout_id<>e->>'checkoutId' THEN RAISE EXCEPTION 'checkout mismatch'; END IF;
    UPDATE billing_orders SET checkout_id=e->>'checkoutId',status='paid' WHERE id=v_order.id;
  END IF;
  IF e->>'subscriptionId' IS NOT NULL AND e->>'startsAt' IS NOT NULL THEN
    SELECT * INTO v_sub FROM billing_subscriptions WHERE mode=v_mode AND id=e->>'subscriptionId';
    IF FOUND AND (v_sub.user_id<>v_order.user_id OR v_sub.source_order<>v_order.id OR v_sub.customer_id<>e->>'customerId') THEN RAISE EXCEPTION 'subscription ownership mismatch'; END IF;
    INSERT INTO billing_subscriptions(mode,id,user_id,source_order,customer_id,product_id,status,period_start,period_end,last_event_at)
      VALUES(v_mode,e->>'subscriptionId',v_order.user_id,v_order.id,e->>'customerId',v_order.product_id,e->>'status',(e->>'startsAt')::timestamptz,(e->>'expiresAt')::timestamptz,(e->>'eventAt')::timestamptz)
      ON CONFLICT(mode,id) DO UPDATE SET status=EXCLUDED.status,period_start=EXCLUDED.period_start,period_end=EXCLUDED.period_end,last_event_at=EXCLUDED.last_event_at
      WHERE billing_subscriptions.last_event_at < EXCLUDED.last_event_at;
  END IF;
  IF v_action<>'grant' THEN RETURN 'synchronized'; END IF;
  SELECT * INTO v_batch FROM credit_batches WHERE mode=v_mode AND payment_key=e->>'paymentKey';
  IF FOUND THEN
    IF v_batch.user_id<>v_order.user_id OR v_batch.order_id<>v_order.id OR v_batch.granted<>(e->>'credits')::int OR v_batch.expires_at<>(e->>'expiresAt')::timestamptz THEN RAISE EXCEPTION 'payment identity conflict'; END IF;
    RETURN 'duplicate_payment';
  END IF;
  SELECT EXISTS(SELECT 1 FROM billing_revocations WHERE mode=v_mode AND payment_key=e->>'paymentKey') INTO v_revoked;
  INSERT INTO credit_batches(user_id,mode,payment_key,order_id,subscription_id,kind,granted,remaining,price_cents,paid_at,starts_at,expires_at,revoked_at)
    VALUES(v_order.user_id,v_mode,e->>'paymentKey',v_order.id,e->>'subscriptionId',e->>'kind',(e->>'credits')::int,
      CASE WHEN v_revoked THEN 0 ELSE (e->>'credits')::int END,(e->>'priceCents')::int,(e->>'paidAt')::timestamptz,(e->>'startsAt')::timestamptz,(e->>'expiresAt')::timestamptz,CASE WHEN v_revoked THEN NOW() ELSE NULL END);
  IF NOT v_revoked THEN INSERT INTO credit_ledger(user_id,event_type,paid_delta) VALUES(v_order.user_id,'grant',(e->>'credits')::int); END IF;
  IF v_revoked AND e->>'kind'='pro' AND EXISTS(SELECT 1 FROM billing_subscriptions WHERE mode=v_mode AND id=e->>'subscriptionId' AND period_end<=(e->>'expiresAt')::timestamptz) THEN
    INSERT INTO billing_cancellations(mode,subscription_id) VALUES(v_mode,e->>'subscriptionId') ON CONFLICT DO NOTHING;
  END IF;
  UPDATE billing_orders SET status='paid' WHERE id=v_order.id;
  PERFORM refresh_credit_wallet(v_order.user_id);
  RETURN CASE WHEN v_revoked THEN 'revoked_before_grant' ELSE 'granted' END;
END;
$$;

CREATE OR REPLACE FUNCTION open_billing_order(p_id UUID,p_user_id TEXT,p_mode TEXT,p_offer TEXT,p_product TEXT)
RETURNS SETOF billing_orders LANGUAGE plpgsql AS $$
DECLARE v_order billing_orders%ROWTYPE;
BEGIN
  PERFORM 1 FROM credit_wallets WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet missing'; END IF;
  SELECT * INTO v_order FROM billing_orders WHERE id=p_id;
  IF FOUND THEN
    IF v_order.user_id<>p_user_id OR v_order.mode<>p_mode OR v_order.offer_key<>p_offer OR v_order.product_id<>p_product THEN RAISE EXCEPTION 'order identity conflict'; END IF;
    RETURN NEXT v_order; RETURN;
  END IF;
  IF p_offer='pro-monthly-500' THEN
    IF EXISTS(SELECT 1 FROM billing_subscriptions WHERE user_id=p_user_id AND mode=p_mode AND status NOT IN ('canceled','expired')) THEN RAISE EXCEPTION 'manage existing subscription'; END IF;
    SELECT * INTO v_order FROM billing_orders WHERE user_id=p_user_id AND mode=p_mode AND offer_key=p_offer AND status IN ('pending','created') ORDER BY created_at LIMIT 1;
    IF FOUND THEN RETURN NEXT v_order; RETURN; END IF;
  END IF;
  RETURN QUERY INSERT INTO billing_orders(id,user_id,mode,offer_key,product_id) VALUES(p_id,p_user_id,p_mode,p_offer,p_product) RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION replace_expired_billing_order(p_id UUID,p_user_id TEXT)
RETURNS SETOF billing_orders LANGUAGE plpgsql AS $$
DECLARE v_order billing_orders%ROWTYPE; v_id UUID;
BEGIN
  PERFORM 1 FROM credit_wallets WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO v_order FROM billing_orders WHERE id=p_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR v_order.status='paid' THEN RAISE EXCEPTION 'order cannot be replaced'; END IF;
  IF v_order.replacement_id IS NOT NULL THEN RETURN QUERY SELECT * FROM billing_orders WHERE id=v_order.replacement_id; RETURN; END IF;
  v_id:=gen_random_uuid();
  INSERT INTO billing_orders(id,user_id,mode,offer_key,product_id) VALUES(v_id,v_order.user_id,v_order.mode,v_order.offer_key,v_order.product_id);
  UPDATE billing_orders SET status='expired',replacement_id=v_id WHERE id=p_id;
  RETURN QUERY SELECT * FROM billing_orders WHERE id=v_id;
END;
$$;

CREATE OR REPLACE FUNCTION reserve_tool_credits(p_user_id TEXT,p_tool_id TEXT,p_amount INTEGER,p_idempotency_key TEXT)
RETURNS TABLE(id UUID,status TEXT,amount INTEGER,free_credits INTEGER,paid_credits INTEGER) LANGUAGE plpgsql AS $$
DECLARE v_wallet credit_wallets%ROWTYPE; v_existing credit_reservations%ROWTYPE; v_id UUID; v_free INTEGER; v_paid INTEGER; v_left INTEGER; v_take INTEGER; v_batch credit_batches%ROWTYPE;
BEGIN
  IF p_amount<=0 THEN RAISE EXCEPTION 'invalid credit amount'; END IF;
  PERFORM refresh_credit_wallet(p_user_id);
  SELECT * INTO v_wallet FROM credit_wallets WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_existing FROM credit_reservations WHERE idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing.user_id<>p_user_id OR v_existing.tool_id<>p_tool_id OR v_existing.amount<>p_amount THEN RAISE EXCEPTION 'reservation identity conflict'; END IF;
    RETURN QUERY SELECT v_existing.id,v_existing.status,v_existing.amount,v_existing.free_credits,v_existing.paid_credits; RETURN;
  END IF;
  IF v_wallet.free_credits+v_wallet.paid_credits<p_amount THEN RETURN; END IF;
  v_free:=LEAST(v_wallet.free_credits,p_amount); v_paid:=p_amount-v_free; v_left:=v_paid;
  INSERT INTO credit_reservations(user_id,tool_id,amount,free_credits,paid_credits,idempotency_key) VALUES(p_user_id,p_tool_id,p_amount,v_free,v_paid,p_idempotency_key) RETURNING credit_reservations.id INTO v_id;
  FOR v_batch IN SELECT * FROM credit_batches WHERE user_id=p_user_id AND revoked_at IS NULL AND remaining>0 AND starts_at<=NOW() AND (expires_at IS NULL OR expires_at>NOW()) ORDER BY expires_at ASC NULLS LAST,paid_at,id LOOP
    EXIT WHEN v_left=0;
    v_take:=LEAST(v_left,v_batch.remaining);
    UPDATE credit_batches SET remaining=remaining-v_take WHERE credit_batches.id=v_batch.id;
    INSERT INTO credit_allocations(reservation_id,batch_id,amount) VALUES(v_id,v_batch.id,v_take);
    v_left:=v_left-v_take;
  END LOOP;
  IF v_left<>0 THEN RAISE EXCEPTION 'credit allocation mismatch'; END IF;
  UPDATE credit_wallets w SET free_credits=w.free_credits-v_free,paid_credits=w.paid_credits-v_paid,updated_at=NOW() WHERE user_id=p_user_id;
  INSERT INTO credit_ledger(user_id,reservation_id,event_type,free_delta,paid_delta) VALUES(p_user_id,v_id,'reserve',-v_free,-v_paid);
  RETURN QUERY SELECT v_id,'reserved'::text,p_amount,v_free,v_paid;
END;
$$;

CREATE OR REPLACE FUNCTION consume_tool_credits(p_reservation_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_row credit_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM credit_reservations WHERE id=p_reservation_id;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM refresh_credit_wallet(v_row.user_id);
  SELECT * INTO v_row FROM credit_reservations WHERE id=p_reservation_id FOR UPDATE;
  IF v_row.status<>'reserved' THEN RETURN; END IF;
  UPDATE credit_batches b SET consumed=consumed+a.amount FROM credit_allocations a WHERE a.reservation_id=p_reservation_id AND a.batch_id=b.id;
  UPDATE credit_reservations SET status='consumed',updated_at=NOW() WHERE id=p_reservation_id;
  INSERT INTO credit_ledger(user_id,reservation_id,event_type) VALUES(v_row.user_id,v_row.id,'consume');
END;
$$;

CREATE OR REPLACE FUNCTION refund_tool_credits(p_reservation_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_row credit_reservations%ROWTYPE; v_paid INTEGER;
BEGIN
  SELECT * INTO v_row FROM credit_reservations WHERE id=p_reservation_id;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM refresh_credit_wallet(v_row.user_id);
  SELECT * INTO v_row FROM credit_reservations WHERE id=p_reservation_id FOR UPDATE;
  IF v_row.status<>'reserved' THEN RETURN; END IF;
  SELECT COALESCE(SUM(a.amount),0)::int INTO v_paid FROM credit_allocations a JOIN credit_batches b ON b.id=a.batch_id WHERE a.reservation_id=p_reservation_id AND b.revoked_at IS NULL AND (b.expires_at IS NULL OR b.expires_at>NOW());
  UPDATE credit_batches b SET remaining=remaining+a.amount FROM credit_allocations a WHERE a.reservation_id=p_reservation_id AND a.batch_id=b.id AND b.revoked_at IS NULL AND (b.expires_at IS NULL OR b.expires_at>NOW());
  UPDATE credit_wallets SET free_credits=free_credits+v_row.free_credits WHERE user_id=v_row.user_id;
  UPDATE credit_reservations SET status='refunded',updated_at=NOW() WHERE id=p_reservation_id;
  INSERT INTO credit_ledger(user_id,reservation_id,event_type,free_delta,paid_delta) VALUES(v_row.user_id,v_row.id,'refund',v_row.free_credits,v_paid);
  PERFORM refresh_credit_wallet(v_row.user_id);
END;
$$;
