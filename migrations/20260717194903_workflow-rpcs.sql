CREATE OR REPLACE FUNCTION public.log_buildstax_call(
  p_workspace_id UUID,
  p_call_id TEXT,
  p_business_id TEXT,
  p_outcome TEXT,
  p_summary TEXT,
  p_transcript TEXT,
  p_duration_seconds INTEGER,
  p_provider TEXT,
  p_mode TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business public.businesses%ROWTYPE;
  v_stage TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF NOT public.can_mutate_workspace(p_workspace_id) THEN RAISE EXCEPTION 'Permission denied'; END IF;
  SELECT * INTO v_business FROM public.businesses
  WHERE workspace_id = p_workspace_id AND id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Business not found'; END IF;
  IF v_business.stage NOT IN ('call_ready', 'contacted', 'interested', 'quoted', 'payment_pending') THEN
    RAISE EXCEPTION 'Business is not ready for outreach';
  END IF;
  IF p_outcome NOT IN ('interested', 'follow_up', 'no_answer', 'not_interested', 'do_not_call') THEN
    RAISE EXCEPTION 'Invalid call outcome';
  END IF;

  v_stage := v_business.stage;
  IF p_outcome = 'interested' AND v_business.stage IN ('call_ready', 'contacted') THEN v_stage := 'interested'; END IF;
  IF p_outcome IN ('follow_up', 'no_answer') AND v_business.stage IN ('call_ready', 'contacted') THEN v_stage := 'contacted'; END IF;
  IF p_outcome = 'not_interested' THEN v_stage := 'lost'; END IF;
  IF p_outcome = 'do_not_call' THEN v_stage := 'dnc'; END IF;

  INSERT INTO public.calls (
    id, workspace_id, business_id, status, outcome, summary, transcript,
    duration_seconds, provider, mode, cost_cents, created_at
  ) VALUES (
    p_call_id, p_workspace_id, p_business_id, 'completed', p_outcome, trim(p_summary),
    coalesce(trim(p_transcript), ''), p_duration_seconds, p_provider, p_mode, 0, v_now
  );

  UPDATE public.businesses SET
    stage = v_stage,
    do_not_call = CASE WHEN p_outcome = 'do_not_call' THEN TRUE ELSE do_not_call END,
    last_contact_at = v_now,
    next_action = CASE p_outcome
      WHEN 'interested' THEN 'Capture requirements and prepare quote'
      WHEN 'follow_up' THEN 'Place follow-up call'
      WHEN 'no_answer' THEN 'Retry call'
      WHEN 'not_interested' THEN 'No further action'
      WHEN 'do_not_call' THEN 'No outreach permitted'
    END,
    next_action_at = CASE WHEN p_outcome IN ('not_interested', 'do_not_call') THEN NULL ELSE v_now + interval '1 day' END
  WHERE workspace_id = p_workspace_id AND id = p_business_id;

  INSERT INTO public.audit_events (id, workspace_id, actor_id, action, entity_type, entity_id, detail)
  VALUES ('aud_' || gen_random_uuid()::text, p_workspace_id, auth.uid()::text, 'call.logged', 'business', p_business_id,
    'Recorded a ' || replace(p_outcome, '_', ' ') || ' call outcome.');
  RETURN p_call_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_buildstax_quote(
  p_workspace_id UUID,
  p_quote_id TEXT,
  p_business_id TEXT,
  p_estimated_cost_cents INTEGER,
  p_proposed_price_cents INTEGER,
  p_scope TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business public.businesses%ROWTYPE;
  v_existing_id TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF NOT public.can_mutate_workspace(p_workspace_id) THEN RAISE EXCEPTION 'Permission denied'; END IF;
  SELECT * INTO v_business FROM public.businesses
  WHERE workspace_id = p_workspace_id AND id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Business not found'; END IF;
  IF v_business.stage NOT IN ('interested', 'quoted') THEN RAISE EXCEPTION 'Record an interested call before quoting'; END IF;

  SELECT id INTO v_existing_id FROM public.quotes
  WHERE workspace_id = p_workspace_id AND business_id = p_business_id AND status = 'sent'
    AND proposed_price_cents = p_proposed_price_cents AND scope = trim(p_scope)
  ORDER BY created_at DESC LIMIT 1;
  IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;

  UPDATE public.quotes SET status = 'expired'
  WHERE workspace_id = p_workspace_id AND business_id = p_business_id AND status = 'sent';

  INSERT INTO public.quotes (
    id, workspace_id, business_id, estimated_cost_cents, configured_floor_cents,
    multiplier_floor_cents, enforced_floor_cents, proposed_price_cents, scope,
    status, expires_at, created_at
  ) VALUES (
    p_quote_id, p_workspace_id, p_business_id, p_estimated_cost_cents, 1, 1, 1,
    p_proposed_price_cents, trim(p_scope), 'sent', p_expires_at, v_now
  );

  UPDATE public.businesses SET stage = 'quoted', estimated_site_cost_cents = p_estimated_cost_cents,
    next_action = 'Follow up on quote', next_action_at = v_now + interval '2 days'
  WHERE workspace_id = p_workspace_id AND id = p_business_id;

  INSERT INTO public.audit_events (id, workspace_id, actor_id, action, entity_type, entity_id, detail)
  VALUES ('aud_' || gen_random_uuid()::text, p_workspace_id, auth.uid()::text, 'quote.sent', 'business', p_business_id,
    'Recorded a floor-compliant customer quote.');
  RETURN p_quote_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_buildstax_payment(
  p_workspace_id UUID,
  p_payment_id TEXT,
  p_business_id TEXT,
  p_quote_id TEXT,
  p_amount_cents INTEGER,
  p_reference TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business public.businesses%ROWTYPE;
  v_quote public.quotes%ROWTYPE;
  v_existing_id TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF NOT public.can_mutate_workspace(p_workspace_id) THEN RAISE EXCEPTION 'Permission denied'; END IF;
  SELECT * INTO v_business FROM public.businesses
  WHERE workspace_id = p_workspace_id AND id = p_business_id FOR UPDATE;
  IF NOT FOUND OR v_business.stage NOT IN ('quoted', 'payment_pending') THEN RAISE EXCEPTION 'Business is not awaiting payment'; END IF;
  SELECT * INTO v_quote FROM public.quotes
  WHERE workspace_id = p_workspace_id AND business_id = p_business_id AND id = p_quote_id FOR UPDATE;
  IF NOT FOUND OR v_quote.status NOT IN ('sent', 'accepted') THEN RAISE EXCEPTION 'Open quote not found'; END IF;
  IF p_amount_cents <> v_quote.proposed_price_cents THEN RAISE EXCEPTION 'Payment must match the accepted quote'; END IF;
  SELECT id INTO v_existing_id FROM public.payments
  WHERE workspace_id = p_workspace_id AND quote_id = p_quote_id;
  IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;

  INSERT INTO public.payments (
    id, workspace_id, business_id, quote_id, amount_cents, status, provider, reference, paid_at, created_at
  ) VALUES (
    p_payment_id, p_workspace_id, p_business_id, p_quote_id, p_amount_cents,
    'paid', 'Manual record', trim(p_reference), v_now, v_now
  );
  UPDATE public.quotes SET status = 'accepted'
  WHERE workspace_id = p_workspace_id AND id = p_quote_id;
  UPDATE public.businesses SET stage = 'paid', next_action = 'Start build', next_action_at = v_now
  WHERE workspace_id = p_workspace_id AND id = p_business_id;
  INSERT INTO public.audit_events (id, workspace_id, actor_id, action, entity_type, entity_id, detail)
  VALUES ('aud_' || gen_random_uuid()::text, p_workspace_id, auth.uid()::text, 'payment.recorded', 'business', p_business_id,
    'Recorded full payment against the accepted quote.');
  RETURN p_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_buildstax_project(
  p_workspace_id UUID,
  p_project_id TEXT,
  p_run_id TEXT,
  p_business_id TEXT,
  p_preview_token TEXT,
  p_provider TEXT,
  p_mode TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business public.businesses%ROWTYPE;
  v_existing_id TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF NOT public.can_mutate_workspace(p_workspace_id) THEN RAISE EXCEPTION 'Permission denied'; END IF;
  SELECT * INTO v_business FROM public.businesses
  WHERE workspace_id = p_workspace_id AND id = p_business_id FOR UPDATE;
  IF NOT FOUND OR v_business.stage <> 'paid' THEN RAISE EXCEPTION 'Business must be paid before build'; END IF;
  IF char_length(trim(v_business.requirements)) < 20 THEN RAISE EXCEPTION 'Customer requirements are required before build'; END IF;
  SELECT id INTO v_existing_id FROM public.projects
  WHERE workspace_id = p_workspace_id AND business_id = p_business_id;
  IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;

  INSERT INTO public.projects (
    id, workspace_id, business_id, status, brief, preview_token, revision_count, created_at, updated_at
  ) VALUES (
    p_project_id, p_workspace_id, p_business_id, 'building', v_business.requirements,
    p_preview_token, 0, v_now, v_now
  );
  UPDATE public.businesses SET stage = 'building', next_action = 'Review generated preview', next_action_at = v_now + interval '1 day'
  WHERE workspace_id = p_workspace_id AND id = p_business_id;
  INSERT INTO public.automation_runs (
    id, workspace_id, type, status, provider, mode, summary, spend_cents, metadata, started_at, finished_at
  ) VALUES (
    p_run_id, p_workspace_id, 'site_build', 'succeeded', p_provider, p_mode,
    'Generated a persistent customer preview for ' || v_business.name || '.', 0,
    jsonb_build_object('businessId', p_business_id, 'projectId', p_project_id), v_now, v_now
  );
  INSERT INTO public.audit_events (id, workspace_id, actor_id, action, entity_type, entity_id, detail)
  VALUES ('aud_' || gen_random_uuid()::text, p_workspace_id, auth.uid()::text, 'project.started', 'business', p_business_id,
    'Created a customer preview in the isolated build workflow.');
  RETURN p_project_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_buildstax_project(
  p_workspace_id UUID,
  p_project_id TEXT,
  p_business_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_project_status TEXT;
  v_business_stage TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF NOT public.can_mutate_workspace(p_workspace_id) THEN RAISE EXCEPTION 'Permission denied'; END IF;
  SELECT * INTO v_project FROM public.projects
  WHERE workspace_id = p_workspace_id AND id = p_project_id AND business_id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
  CASE v_project.status
    WHEN 'queued' THEN v_project_status := 'building'; v_business_stage := 'building';
    WHEN 'building' THEN v_project_status := 'review'; v_business_stage := 'review';
    WHEN 'review' THEN v_project_status := 'delivered'; v_business_stage := 'delivered';
    WHEN 'delivered' THEN v_project_status := 'complete'; v_business_stage := 'won';
    ELSE RAISE EXCEPTION 'Project is already complete';
  END CASE;
  UPDATE public.projects SET status = v_project_status,
    delivered_at = CASE WHEN v_project_status = 'delivered' THEN v_now ELSE delivered_at END
  WHERE workspace_id = p_workspace_id AND id = p_project_id;
  UPDATE public.businesses SET stage = v_business_stage,
    next_action = CASE v_project_status WHEN 'building' THEN 'Complete first build' WHEN 'review' THEN 'Send preview for review' WHEN 'delivered' THEN 'Confirm launch handoff' ELSE 'No action due' END,
    next_action_at = CASE WHEN v_project_status = 'complete' THEN NULL ELSE v_now + interval '1 day' END
  WHERE workspace_id = p_workspace_id AND id = p_business_id;
  INSERT INTO public.audit_events (id, workspace_id, actor_id, action, entity_type, entity_id, detail)
  VALUES ('aud_' || gen_random_uuid()::text, p_workspace_id, auth.uid()::text, 'project.advanced', 'business', p_business_id,
    'Advanced the project to ' || v_project_status || '.');
  RETURN v_project_status;
END;
$$;

REVOKE ALL ON FUNCTION public.log_buildstax_call(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_buildstax_quote(UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_buildstax_payment(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_buildstax_project(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_buildstax_project(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_buildstax_call(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_buildstax_quote(UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_buildstax_payment(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_buildstax_project(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_buildstax_project(UUID, TEXT, TEXT) TO authenticated;
