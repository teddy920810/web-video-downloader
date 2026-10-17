-- Verified sign-ins select one existing account, without merging rows or balances.
-- Internal complimentary monthly batches are entitlements, not paid orders.
CREATE OR REPLACE FUNCTION streamnest_auth.link_identity(p_subject text,p_email text,p_name text,p_image text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_id text; v_entitled_count integer;
BEGIN
  p_email:=lower(p_email);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_email,74192));
  SELECT user_id INTO v_id FROM streamnest_auth.identities WHERE email=p_email;
  IF FOUND THEN RETURN v_id; END IF;
  SELECT count(*) INTO v_entitled_count FROM tool_accounts a WHERE lower(a.email)=p_email AND (
    EXISTS(SELECT 1 FROM billing_orders o WHERE o.user_id=a.user_id AND o.mode='live' AND o.status='paid') OR
    EXISTS(SELECT 1 FROM credit_batches b WHERE b.user_id=a.user_id AND b.mode='live' AND b.kind='pro'
      AND b.revoked_at IS NULL AND b.starts_at<=now() AND b.expires_at>now())
  );
  IF v_entitled_count>1 THEN RAISE EXCEPTION 'account_link_review_required'; END IF;
  IF v_entitled_count=1 THEN
    SELECT a.user_id INTO v_id FROM tool_accounts a WHERE lower(a.email)=p_email AND (
      EXISTS(SELECT 1 FROM billing_orders o WHERE o.user_id=a.user_id AND o.mode='live' AND o.status='paid') OR
      EXISTS(SELECT 1 FROM credit_batches b WHERE b.user_id=a.user_id AND b.mode='live' AND b.kind='pro'
        AND b.revoked_at IS NULL AND b.starts_at<=now() AND b.expires_at>now())
    );
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
