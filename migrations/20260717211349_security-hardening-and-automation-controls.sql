-- Close direct-write escape hatches and make provider work durable. Application
-- reads continue through tenant-scoped RLS; trusted writes use protected RPCs
-- or the server-only InsForge admin client after an authenticated authorization
-- check.

UPDATE public.workspaces
SET currency = 'USD',
    block_dnc_outreach = TRUE,
    require_payment_before_build = TRUE;

ALTER TABLE public.workspaces
  ALTER COLUMN currency SET DEFAULT 'USD',
  ALTER COLUMN block_dnc_outreach SET DEFAULT TRUE,
  ALTER COLUMN require_payment_before_build SET DEFAULT TRUE,
  DROP CONSTRAINT IF EXISTS workspaces_currency_check,
  ADD CONSTRAINT workspaces_currency_usd_only CHECK (currency = 'USD'),
  ADD CONSTRAINT workspaces_dnc_always_blocked CHECK (block_dnc_outreach),
  ADD CONSTRAINT workspaces_payment_always_required CHECK (require_payment_before_build);

CREATE OR REPLACE FUNCTION public.enforce_permanent_dnc()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (OLD.do_not_call OR OLD.stage = 'dnc')
     AND (NOT NEW.do_not_call OR NEW.stage <> 'dnc') THEN
    RAISE EXCEPTION 'Do-not-call status is permanent';
  END IF;

  IF NEW.do_not_call OR NEW.stage = 'dnc' THEN
    NEW.do_not_call := TRUE;
    NEW.stage := 'dnc';
    NEW.next_action := 'No outreach permitted';
    NEW.next_action_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS businesses_permanent_dnc ON public.businesses;
CREATE TRIGGER businesses_permanent_dnc
BEFORE INSERT OR UPDATE OF do_not_call, stage ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.enforce_permanent_dnc();

CREATE OR REPLACE FUNCTION public.guard_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business public.businesses%ROWTYPE;
  v_require_call BOOLEAN;
BEGIN
  IF NEW.direction <> 'outbound' OR NEW.channel <> 'email' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_business
  FROM public.businesses
  WHERE workspace_id = NEW.workspace_id AND id = NEW.business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business not found';
  END IF;
  IF v_business.do_not_call OR v_business.stage = 'dnc' THEN
    RAISE EXCEPTION 'Outbound email is permanently blocked for this business';
  END IF;

  SELECT require_call_before_email INTO v_require_call
  FROM public.workspaces WHERE id = NEW.workspace_id;
  IF v_require_call AND NOT EXISTS (
    SELECT 1 FROM public.calls
    WHERE workspace_id = NEW.workspace_id
      AND business_id = NEW.business_id
      AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'A completed phone call is required before outbound email';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_quote_expiration()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.status IN ('draft', 'sent', 'accepted') AND NEW.expires_at <= now() THEN
    RAISE EXCEPTION 'An open quote must expire in the future';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotes_expiration_guard ON public.quotes;
CREATE TRIGGER quotes_expiration_guard
BEFORE INSERT OR UPDATE OF expires_at, status ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.guard_quote_expiration();

CREATE OR REPLACE FUNCTION public.guard_payment_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_quote public.quotes%ROWTYPE;
  v_paid_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_quote FROM public.quotes
  WHERE workspace_id = NEW.workspace_id
    AND business_id = NEW.business_id
    AND id = NEW.quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;
  IF NEW.status = 'paid' THEN
    IF NEW.amount_cents <> v_quote.proposed_price_cents THEN
      RAISE EXCEPTION 'Paid amount must match the accepted quote';
    END IF;
    v_paid_at := COALESCE(NEW.paid_at, NEW.created_at, now());
    IF v_quote.expires_at < v_paid_at THEN
      RAISE EXCEPTION 'Payment evidence was received after the quote expired';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_buildstax_stripe_environment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, payments, pg_temp
AS $$
DECLARE
  v_object JSONB;
  v_metadata JSONB;
  v_expected_environment TEXT;
  v_workspace_id UUID;
  v_business_id TEXT;
  v_quote_id TEXT;
  v_quote_expires_at TIMESTAMPTZ;
BEGIN
  IF NEW.provider <> 'stripe'
     OR NEW.processing_status <> 'processed'
     OR NEW.event_type NOT IN (
       'checkout.session.completed',
       'checkout.session.async_payment_succeeded',
       'payment_intent.succeeded'
     ) THEN
    RETURN NEW;
  END IF;

  v_object := NEW.payload #> '{data,object}';
  IF v_object IS NULL OR jsonb_typeof(v_object) <> 'object' THEN
    RETURN NEW;
  END IF;
  v_metadata := COALESCE(v_object -> 'metadata', '{}'::jsonb);
  IF v_metadata ->> 'buildstax_application' <> 'buildstax' THEN
    RETURN NEW;
  END IF;

  v_expected_environment := v_metadata ->> 'buildstax_environment';
  IF NEW.environment::TEXT NOT IN ('test', 'live')
     OR v_expected_environment NOT IN ('test', 'live')
     OR v_expected_environment <> NEW.environment::TEXT THEN
    RAISE EXCEPTION 'Stripe event environment does not match BuildStax checkout metadata';
  END IF;

  IF COALESCE(v_metadata ->> 'buildstax_workspace_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'Stripe event has an invalid BuildStax workspace reference';
  END IF;
  v_workspace_id := (v_metadata ->> 'buildstax_workspace_id')::UUID;
  v_business_id := NULLIF(v_metadata ->> 'buildstax_business_id', '');
  v_quote_id := NULLIF(v_metadata ->> 'buildstax_quote_id', '');

  SELECT expires_at INTO v_quote_expires_at
  FROM public.quotes
  WHERE workspace_id = v_workspace_id
    AND business_id = v_business_id
    AND id = v_quote_id;
  IF v_quote_expires_at IS NULL THEN
    RAISE EXCEPTION 'Stripe event does not match a BuildStax quote';
  END IF;
  IF v_quote_expires_at < COALESCE(NEW.processed_at, now()) THEN
    RAISE EXCEPTION 'Stripe payment was verified after the BuildStax quote expired';
  END IF;
  RETURN NEW;
END;
$$;

-- The public preview projection includes only approved delivery inputs. Raw
-- customer text remains React text and is never treated as markup or CSS.
DROP FUNCTION public.get_buildstax_preview(TEXT);
CREATE FUNCTION public.get_buildstax_preview(p_token TEXT)
RETURNS TABLE (
  project_id TEXT,
  project_status TEXT,
  revision_count INTEGER,
  business_id TEXT,
  business_name TEXT,
  category TEXT,
  location TEXT,
  phone TEXT,
  project_brief TEXT,
  preferred_style TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT p.id, p.status, p.revision_count, b.id, b.name, b.category,
         b.location, b.phone, p.brief, b.preferred_style
  FROM public.projects AS p
  JOIN public.businesses AS b
    ON b.workspace_id = p.workspace_id AND b.id = p.business_id
  WHERE p.preview_token = p_token
    AND p.status IN ('review', 'delivered', 'complete')
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_buildstax_preview(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_buildstax_preview(TEXT) TO anon, authenticated;

CREATE TABLE public.integration_outbox (
  id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 2 AND 160),
  payload JSONB NOT NULL CHECK (pg_column_size(payload) <= 65536),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT NOT NULL DEFAULT '' CHECK (char_length(last_error) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  UNIQUE (workspace_id, id)
);
CREATE INDEX integration_outbox_pending_idx
  ON public.integration_outbox(workspace_id, status, created_at);
ALTER TABLE public.integration_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY integration_outbox_select ON public.integration_outbox
FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE TRIGGER integration_outbox_workspace_guard
BEFORE UPDATE ON public.integration_outbox
FOR EACH ROW EXECUTE FUNCTION public.prevent_workspace_change();

CREATE FUNCTION public.record_buildstax_audit(
  p_workspace_id UUID,
  p_audit_id TEXT,
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_detail TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_created_at TIMESTAMPTZ := now();
  v_outbox_id TEXT := 'out_' || gen_random_uuid()::TEXT;
  v_actor_id TEXT := auth.uid()::TEXT;
BEGIN
  IF NOT public.can_mutate_workspace(p_workspace_id) OR v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Mutation permission required';
  END IF;
  INSERT INTO public.audit_events (
    id, workspace_id, actor_id, action, entity_type, entity_id, detail, created_at
  ) VALUES (
    p_audit_id, p_workspace_id, v_actor_id, p_action, p_entity_type,
    p_entity_id, p_detail, v_created_at
  );
  INSERT INTO public.integration_outbox (
    id, workspace_id, event_type, payload, created_at
  ) VALUES (
    v_outbox_id,
    p_workspace_id,
    p_action,
    jsonb_build_object(
      'workspaceId', p_workspace_id::TEXT,
      'actorId', v_actor_id,
      'action', p_action,
      'entityType', p_entity_type,
      'entityId', p_entity_id,
      'detail', p_detail,
      'createdAt', to_char(v_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    v_created_at
  );
  RETURN jsonb_build_object(
    'auditId', p_audit_id,
    'outboxId', v_outbox_id,
    'createdAt', v_created_at
  );
END;
$$;

CREATE FUNCTION public.get_buildstax_pending_outbox(p_workspace_id UUID, p_limit INTEGER DEFAULT 20)
RETURNS TABLE (outbox_id TEXT, payload JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT public.can_mutate_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'Mutation permission required';
  END IF;
  RETURN QUERY
  SELECT o.id, o.payload
  FROM public.integration_outbox AS o
  WHERE o.workspace_id = p_workspace_id AND o.status = 'pending'
  ORDER BY o.created_at
  LIMIT greatest(1, least(coalesce(p_limit, 20), 50));
END;
$$;

CREATE FUNCTION public.record_buildstax_outbox_attempt(
  p_workspace_id UUID,
  p_outbox_id TEXT,
  p_delivered BOOLEAN,
  p_error TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT public.can_mutate_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'Mutation permission required';
  END IF;
  UPDATE public.integration_outbox
  SET status = CASE WHEN p_delivered THEN 'delivered' ELSE 'pending' END,
      attempts = attempts + 1,
      last_error = CASE WHEN p_delivered THEN '' ELSE left(coalesce(p_error, 'delivery_failed'), 500) END,
      delivered_at = CASE WHEN p_delivered THEN now() ELSE NULL END
  WHERE workspace_id = p_workspace_id AND id = p_outbox_id;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.consume_buildstax_rate_limit(
  p_key TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_count INTEGER;
  v_window_started TIMESTAMPTZ;
  v_retry_after INTEGER;
BEGIN
  IF char_length(p_key) NOT BETWEEN 8 AND 220
     OR p_limit NOT BETWEEN 1 AND 100
     OR p_window_seconds NOT BETWEEN 60 AND 86400 THEN
    RAISE EXCEPTION 'Invalid rate-limit policy';
  END IF;

  DELETE FROM public.rate_limits
  WHERE window_started_at < v_now - interval '2 days';

  INSERT INTO public.rate_limits AS rl (key, count, window_started_at)
  VALUES (p_key, 1, v_now)
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN v_now - rl.window_started_at >= make_interval(secs => p_window_seconds) THEN 1
      ELSE rl.count + 1
    END,
    window_started_at = CASE
      WHEN v_now - rl.window_started_at >= make_interval(secs => p_window_seconds) THEN v_now
      ELSE rl.window_started_at
    END
  RETURNING count, window_started_at INTO v_count, v_window_started;

  v_retry_after := greatest(
    0,
    ceil(extract(epoch FROM (
      v_window_started + make_interval(secs => p_window_seconds) - v_now
    )))::INTEGER
  );
  RETURN jsonb_build_object(
    'allowed', v_count <= p_limit,
    'retryAfterSeconds', CASE WHEN v_count <= p_limit THEN 0 ELSE greatest(1, v_retry_after) END
  );
END;
$$;

CREATE FUNCTION public.reserve_buildstax_pitch_run(
  p_workspace_id UUID,
  p_run_id TEXT,
  p_campaign_id TEXT,
  p_reservation_cents INTEGER,
  p_provider TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_campaign public.campaigns%ROWTYPE;
  v_spend_today BIGINT;
  v_existing_id TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF NOT public.can_mutate_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'Mutation permission required';
  END IF;
  IF p_reservation_cents NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'Invalid inference reservation';
  END IF;

  SELECT id INTO v_existing_id FROM public.automation_runs
  WHERE workspace_id = p_workspace_id AND id = p_run_id;
  IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;

  SELECT * INTO v_campaign FROM public.campaigns
  WHERE workspace_id = p_workspace_id AND id = p_campaign_id
  FOR UPDATE;
  IF NOT FOUND OR v_campaign.status = 'archived' THEN
    RAISE EXCEPTION 'Campaign is not available for pitch generation';
  END IF;

  SELECT coalesce(sum(spend_cents), 0) INTO v_spend_today
  FROM public.automation_runs
  WHERE workspace_id = p_workspace_id
    AND type = 'pitch_generation'
    AND metadata ->> 'campaignId' = p_campaign_id
    AND started_at >= date_trunc('day', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  IF v_spend_today + p_reservation_cents > v_campaign.daily_spend_cap_cents THEN
    RAISE EXCEPTION 'Campaign daily spend cap would be exceeded';
  END IF;

  INSERT INTO public.automation_runs (
    id, workspace_id, type, status, provider, mode, summary, spend_cents,
    error, metadata, started_at
  ) VALUES (
    p_run_id, p_workspace_id, 'pitch_generation', 'running', left(p_provider, 120),
    'live', 'Reserved a bounded AkashML pitch-generation request.',
    p_reservation_cents, '',
    jsonb_build_object(
      'campaignId', p_campaign_id,
      'reservation', 'maximum',
      'reservationCents', p_reservation_cents
    ),
    v_now
  );
  INSERT INTO public.audit_events (id, workspace_id, actor_id, action, entity_type, entity_id, detail)
  VALUES (
    'aud_' || gen_random_uuid()::TEXT, p_workspace_id, auth.uid()::TEXT,
    'pitch.spend_reserved', 'campaign', p_campaign_id,
    'Reserved the configured maximum for one supervised AkashML pitch request.'
  );
  RETURN p_run_id;
END;
$$;

CREATE FUNCTION public.complete_buildstax_pitch_run(
  p_workspace_id UUID,
  p_run_id TEXT,
  p_pitch_id TEXT,
  p_label TEXT,
  p_script TEXT,
  p_provider TEXT,
  p_metadata JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_run public.automation_runs%ROWTYPE;
  v_campaign_id TEXT;
BEGIN
  IF NOT public.can_mutate_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'Mutation permission required';
  END IF;
  SELECT * INTO v_run FROM public.automation_runs
  WHERE workspace_id = p_workspace_id AND id = p_run_id
  FOR UPDATE;
  IF NOT FOUND OR v_run.type <> 'pitch_generation' OR v_run.status <> 'running' THEN
    RAISE EXCEPTION 'Pitch run is not awaiting completion';
  END IF;
  v_campaign_id := v_run.metadata ->> 'campaignId';

  INSERT INTO public.pitch_versions (
    id, workspace_id, campaign_id, label, script, status, calls, positive_outcomes
  ) VALUES (
    p_pitch_id, p_workspace_id, v_campaign_id, trim(p_label), trim(p_script),
    'challenger', 0, 0
  );
  UPDATE public.automation_runs
  SET status = 'succeeded',
      provider = left(p_provider, 120),
      summary = 'Generated a schema-validated challenger; operator review is required.',
      metadata = metadata || coalesce(p_metadata, '{}'::JSONB) || jsonb_build_object('pitchId', p_pitch_id),
      finished_at = now()
  WHERE workspace_id = p_workspace_id AND id = p_run_id;
  INSERT INTO public.audit_events (id, workspace_id, actor_id, action, entity_type, entity_id, detail)
  VALUES (
    'aud_' || gen_random_uuid()::TEXT, p_workspace_id, auth.uid()::TEXT,
    'pitch.akashml_generated', 'campaign', v_campaign_id,
    'AkashML generated a schema-validated challenger that remains inactive pending review.'
  );
  RETURN p_pitch_id;
END;
$$;

CREATE FUNCTION public.fail_buildstax_pitch_run(
  p_workspace_id UUID,
  p_run_id TEXT,
  p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_campaign_id TEXT;
BEGIN
  IF NOT public.can_mutate_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'Mutation permission required';
  END IF;
  UPDATE public.automation_runs
  SET status = 'failed',
      summary = 'The bounded AkashML pitch request did not complete.',
      error = left(coalesce(p_error, 'Provider request failed.'), 4000),
      finished_at = now()
  WHERE workspace_id = p_workspace_id AND id = p_run_id AND status = 'running'
  RETURNING metadata ->> 'campaignId' INTO v_campaign_id;
  IF v_campaign_id IS NULL THEN RETURN FALSE; END IF;
  INSERT INTO public.audit_events (id, workspace_id, actor_id, action, entity_type, entity_id, detail)
  VALUES (
    'aud_' || gen_random_uuid()::TEXT, p_workspace_id, auth.uid()::TEXT,
    'pitch.akashml_failed', 'campaign', v_campaign_id,
    'AkashML pitch generation failed; the safety reservation remains counted.'
  );
  RETURN TRUE;
END;
$$;

-- Authenticated clients can read their tenant but cannot write operational
-- tables directly. Protected workflow functions remain the only public write
-- surface; the InsForge admin key is server-only.
DROP POLICY IF EXISTS workspaces_update ON public.workspaces;
DROP POLICY IF EXISTS audit_events_insert ON public.audit_events;
DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'campaigns', 'pitch_versions', 'businesses', 'calls', 'quotes',
    'payments', 'projects', 'messages', 'automation_runs'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_insert', v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_update', v_table);
  END LOOP;
END;
$$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.workspaces, public.workspace_members, public.campaigns,
  public.pitch_versions, public.businesses, public.calls, public.quotes,
  public.payments, public.projects, public.messages, public.automation_runs,
  public.audit_events, public.rate_limits, public.integration_outbox
FROM anon, authenticated;
GRANT SELECT ON public.integration_outbox TO authenticated;

REVOKE ALL ON FUNCTION public.record_buildstax_payment(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.record_buildstax_audit(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_buildstax_pending_outbox(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_buildstax_outbox_attempt(UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_buildstax_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_buildstax_pitch_run(UUID, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_buildstax_pitch_run(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_buildstax_pitch_run(UUID, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_buildstax_audit(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_buildstax_pending_outbox(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_buildstax_outbox_attempt(UUID, TEXT, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_buildstax_pitch_run(UUID, TEXT, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_buildstax_pitch_run(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_buildstax_pitch_run(UUID, TEXT, TEXT) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.consume_buildstax_rate_limit(TEXT, INTEGER, INTEGER) TO service_role';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_permanent_dnc() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_quote_expiration() FROM PUBLIC;

COMMENT ON TABLE public.integration_outbox IS
  'Transactional delivery queue for audited Nexla events; failed delivery remains retryable.';
COMMENT ON FUNCTION public.consume_buildstax_rate_limit(TEXT, INTEGER, INTEGER) IS
  'Atomically consumes a bounded, server-keyed authentication rate limit and prunes stale buckets.';
COMMENT ON FUNCTION public.reserve_buildstax_pitch_run(UUID, TEXT, TEXT, INTEGER, TEXT) IS
  'Reserves a conservative per-request maximum under a locked campaign daily spend cap before AkashML inference.';
