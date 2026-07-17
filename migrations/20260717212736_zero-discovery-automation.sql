-- Persist every audit event into the Nexla delivery outbox in the same database
-- transaction, including events created inside protected workflow functions.

CREATE FUNCTION public.enqueue_buildstax_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO public.integration_outbox (
    id, workspace_id, event_type, payload, created_at
  ) VALUES (
    'out_audit_' || md5(NEW.workspace_id::TEXT || ':' || NEW.id),
    NEW.workspace_id,
    NEW.action,
    jsonb_build_object(
      'workspaceId', NEW.workspace_id::TEXT,
      'actorId', NEW.actor_id,
      'action', NEW.action,
      'entityType', NEW.entity_type,
      'entityId', NEW.entity_id,
      'detail', NEW.detail,
      'createdAt', to_char(NEW.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    NEW.created_at
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_events_nexla_outbox ON public.audit_events;
CREATE TRIGGER audit_events_nexla_outbox
AFTER INSERT ON public.audit_events
FOR EACH ROW EXECUTE FUNCTION public.enqueue_buildstax_audit();
REVOKE ALL ON FUNCTION public.enqueue_buildstax_audit() FROM PUBLIC;

CREATE FUNCTION public.record_buildstax_audit_v2(
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
  v_outbox_id TEXT := 'out_audit_' || md5(p_workspace_id::TEXT || ':' || p_audit_id);
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
  RETURN jsonb_build_object(
    'auditId', p_audit_id,
    'outboxId', v_outbox_id,
    'createdAt', v_created_at
  );
END;
$$;

-- Campaign spend is a single UTC-day budget across all paid automation types.
CREATE FUNCTION public.reserve_buildstax_pitch_run_v2(
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
    jsonb_build_object('campaignId', p_campaign_id, 'reservation', 'maximum', 'reservationCents', p_reservation_cents),
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

CREATE FUNCTION public.reserve_buildstax_discovery_run(
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
  IF p_reservation_cents NOT BETWEEN 1 AND 2 THEN
    RAISE EXCEPTION 'Discovery reservation exceeds the Zero policy cap';
  END IF;
  SELECT id INTO v_existing_id FROM public.automation_runs
  WHERE workspace_id = p_workspace_id AND id = p_run_id;
  IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;

  SELECT * INTO v_campaign FROM public.campaigns
  WHERE workspace_id = p_workspace_id AND id = p_campaign_id
  FOR UPDATE;
  IF NOT FOUND OR v_campaign.status <> 'active' THEN
    RAISE EXCEPTION 'Only active campaigns can run live discovery';
  END IF;
  SELECT coalesce(sum(spend_cents), 0) INTO v_spend_today
  FROM public.automation_runs
  WHERE workspace_id = p_workspace_id
    AND metadata ->> 'campaignId' = p_campaign_id
    AND started_at >= date_trunc('day', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  IF v_spend_today + p_reservation_cents > v_campaign.daily_spend_cap_cents THEN
    RAISE EXCEPTION 'Campaign daily spend cap would be exceeded';
  END IF;

  INSERT INTO public.automation_runs (
    id, workspace_id, type, status, provider, mode, summary, spend_cents,
    error, metadata, started_at
  ) VALUES (
    p_run_id, p_workspace_id, 'discovery', 'running', left(p_provider, 120),
    'live', 'Reserved one policy-capped Zero discovery request.',
    p_reservation_cents, '',
    jsonb_build_object('campaignId', p_campaign_id, 'reservation', 'maximum', 'reservationCents', p_reservation_cents),
    v_now
  );
  INSERT INTO public.audit_events (id, workspace_id, actor_id, action, entity_type, entity_id, detail)
  VALUES (
    'aud_' || gen_random_uuid()::TEXT, p_workspace_id, auth.uid()::TEXT,
    'discovery.spend_reserved', 'campaign', p_campaign_id,
    'Reserved at most two cents for one Zero discovery request.'
  );
  RETURN p_run_id;
END;
$$;

CREATE FUNCTION public.complete_buildstax_discovery_run(
  p_workspace_id UUID,
  p_run_id TEXT,
  p_provider TEXT,
  p_businesses JSONB,
  p_metadata JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_run public.automation_runs%ROWTYPE;
  v_campaign public.campaigns%ROWTYPE;
  v_campaign_id TEXT;
  v_inserted INTEGER := 0;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF NOT public.can_mutate_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'Mutation permission required';
  END IF;
  SELECT * INTO v_run FROM public.automation_runs
  WHERE workspace_id = p_workspace_id AND id = p_run_id
  FOR UPDATE;
  IF NOT FOUND OR v_run.type <> 'discovery' OR v_run.status <> 'running' THEN
    RAISE EXCEPTION 'Discovery run is not awaiting completion';
  END IF;
  v_campaign_id := v_run.metadata ->> 'campaignId';
  SELECT * INTO v_campaign FROM public.campaigns
  WHERE workspace_id = p_workspace_id AND id = v_campaign_id
  FOR UPDATE;
  IF NOT FOUND OR v_campaign.status <> 'active' THEN
    RAISE EXCEPTION 'Campaign is not active';
  END IF;
  IF jsonb_typeof(p_businesses) <> 'array'
     OR jsonb_array_length(p_businesses) < 1
     OR jsonb_array_length(p_businesses) > least(v_campaign.daily_lead_limit, 25) THEN
    RAISE EXCEPTION 'Discovery result count violates the campaign limit';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_businesses) AS x(
      id TEXT, name TEXT, category TEXT, location TEXT, address TEXT,
      phone TEXT, source_ref TEXT
    )
    WHERE char_length(trim(coalesce(x.id, ''))) NOT BETWEEN 8 AND 100
       OR char_length(trim(coalesce(x.name, ''))) NOT BETWEEN 2 AND 160
       OR char_length(trim(coalesce(x.category, ''))) NOT BETWEEN 2 AND 120
       OR char_length(trim(coalesce(x.location, ''))) NOT BETWEEN 2 AND 160
       OR char_length(trim(coalesce(x.phone, ''))) NOT BETWEEN 7 AND 40
       OR char_length(coalesce(x.address, '')) > 500
       OR char_length(coalesce(x.source_ref, '')) > 500
  ) THEN
    RAISE EXCEPTION 'Discovery returned an invalid business record';
  END IF;

  INSERT INTO public.businesses (
    id, workspace_id, campaign_id, name, category, location, address,
    contact_name, phone, email, website_status, source, source_ref, stage,
    score, do_not_call, estimated_site_cost_cents, requirements,
    preferred_style, next_action, next_action_at, created_at, updated_at
  )
  SELECT
    trim(x.id), p_workspace_id, v_campaign_id, trim(x.name), trim(x.category),
    trim(x.location), trim(coalesce(x.address, '')), '', trim(x.phone), '',
    'none', 'zero', trim(coalesce(x.source_ref, '')), 'discovered', 75, FALSE,
    90000, '', '', 'Verify contact and call eligibility', v_now, v_now, v_now
  FROM jsonb_to_recordset(p_businesses) AS x(
    id TEXT, name TEXT, category TEXT, location TEXT, address TEXT,
    phone TEXT, source_ref TEXT
  )
  WHERE NOT EXISTS (
    SELECT 1 FROM public.businesses AS existing
    WHERE existing.workspace_id = p_workspace_id
      AND lower(existing.name) = lower(trim(x.name))
      AND existing.phone = trim(x.phone)
  );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE public.automation_runs
  SET status = 'succeeded',
      provider = left(p_provider, 120),
      summary = 'Qualified and imported ' || v_inserted || ' website-free prospects from Zero.',
      metadata = metadata || coalesce(p_metadata, '{}'::JSONB) || jsonb_build_object('importedCount', v_inserted),
      finished_at = v_now
  WHERE workspace_id = p_workspace_id AND id = p_run_id;
  INSERT INTO public.audit_events (id, workspace_id, actor_id, action, entity_type, entity_id, detail)
  VALUES (
    'aud_' || gen_random_uuid()::TEXT, p_workspace_id, auth.uid()::TEXT,
    'discovery.zero_completed', 'campaign', v_campaign_id,
    'Zero discovery imported ' || v_inserted || ' qualified prospects after schema and website checks.'
  );
  RETURN v_inserted;
END;
$$;

CREATE FUNCTION public.fail_buildstax_discovery_run(
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
      summary = 'The policy-capped Zero discovery request did not complete.',
      error = left(coalesce(p_error, 'Provider request failed.'), 4000),
      finished_at = now()
  WHERE workspace_id = p_workspace_id AND id = p_run_id AND status = 'running'
  RETURNING metadata ->> 'campaignId' INTO v_campaign_id;
  IF v_campaign_id IS NULL THEN RETURN FALSE; END IF;
  INSERT INTO public.audit_events (id, workspace_id, actor_id, action, entity_type, entity_id, detail)
  VALUES (
    'aud_' || gen_random_uuid()::TEXT, p_workspace_id, auth.uid()::TEXT,
    'discovery.zero_failed', 'campaign', v_campaign_id,
    'Zero discovery failed; the safety reservation remains counted.'
  );
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_buildstax_discovery_run(UUID, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_buildstax_discovery_run(UUID, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_buildstax_discovery_run(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_buildstax_audit_v2(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_buildstax_pitch_run_v2(UUID, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_buildstax_discovery_run(UUID, TEXT, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_buildstax_discovery_run(UUID, TEXT, TEXT, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_buildstax_discovery_run(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_buildstax_audit_v2(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_buildstax_pitch_run_v2(UUID, TEXT, TEXT, INTEGER, TEXT) TO authenticated;

COMMENT ON FUNCTION public.reserve_buildstax_discovery_run(UUID, TEXT, TEXT, INTEGER, TEXT) IS
  'Atomically reserves a Zero discovery call under both the intent cap and campaign daily spend cap.';
COMMENT ON TRIGGER audit_events_nexla_outbox ON public.audit_events IS
  'Makes Nexla delivery retryable without separating it from the domain audit transaction.';
