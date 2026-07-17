-- Keep compound campaign creation atomic and align public preview feedback with
-- the optional-email UI while preserving token scoping and rate limiting.

CREATE OR REPLACE FUNCTION public.create_buildstax_campaign(
  p_workspace_id UUID,
  p_campaign_id TEXT,
  p_pitch_id TEXT,
  p_name TEXT,
  p_vertical TEXT,
  p_region TEXT,
  p_daily_lead_limit INTEGER,
  p_daily_spend_cap_cents INTEGER,
  p_pricing_floor_cents INTEGER,
  p_pitch_script TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT public.can_mutate_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'Mutation permission required';
  END IF;

  INSERT INTO public.campaigns (
    id, workspace_id, name, vertical, region, status, daily_lead_limit,
    daily_spend_cap_cents, pricing_floor_cents, pitch_script
  ) VALUES (
    p_campaign_id, p_workspace_id, trim(p_name), trim(p_vertical), trim(p_region),
    'draft', p_daily_lead_limit, p_daily_spend_cap_cents,
    p_pricing_floor_cents, trim(p_pitch_script)
  );

  INSERT INTO public.pitch_versions (
    id, workspace_id, campaign_id, label, script, status, calls, positive_outcomes
  ) VALUES (
    p_pitch_id, p_workspace_id, p_campaign_id, 'Initial pitch',
    trim(p_pitch_script), 'active', 0, 0
  );

  RETURN p_campaign_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_buildstax_campaign(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_buildstax_campaign(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT
) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_buildstax_feedback(
  p_token TEXT,
  p_email TEXT,
  p_feedback TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_rate_key TEXT := 'preview:' || md5(p_token);
  v_rate public.rate_limits%ROWTYPE;
  v_email TEXT := lower(trim(coalesce(p_email, '')));
BEGIN
  IF (v_email <> '' AND v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
     OR char_length(v_email) > 320
     OR char_length(trim(p_feedback)) NOT BETWEEN 12 AND 4000 THEN
    RAISE EXCEPTION 'Invalid feedback';
  END IF;

  SELECT * INTO v_project FROM public.projects
  WHERE preview_token = p_token
    AND status IN ('review', 'delivered', 'complete')
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO v_rate FROM public.rate_limits WHERE key = v_rate_key FOR UPDATE;
  IF FOUND AND v_now - v_rate.window_started_at < interval '15 minutes' THEN
    IF v_rate.count >= 5 THEN
      RAISE EXCEPTION 'Too many feedback submissions';
    END IF;
    UPDATE public.rate_limits SET count = count + 1 WHERE key = v_rate_key;
  ELSE
    INSERT INTO public.rate_limits AS rl (key, count, window_started_at)
    VALUES (v_rate_key, 1, v_now)
    ON CONFLICT (key) DO UPDATE SET count = 1, window_started_at = excluded.window_started_at;
  END IF;

  INSERT INTO public.messages (
    id, workspace_id, business_id, direction, channel, status, subject, body, provider
  ) VALUES (
    'msg_' || gen_random_uuid()::text,
    v_project.workspace_id,
    v_project.business_id,
    'inbound',
    'preview',
    'received',
    CASE WHEN v_email = '' THEN 'Preview feedback' ELSE 'Preview feedback from ' || v_email END,
    trim(p_feedback),
    'Customer preview'
  );

  UPDATE public.projects
  SET revision_count = revision_count + 1,
      status = CASE WHEN status = 'complete' THEN 'review' ELSE status END,
      updated_at = v_now
  WHERE workspace_id = v_project.workspace_id AND id = v_project.id;

  UPDATE public.businesses
  SET stage = 'review',
      next_action = 'Review customer feedback',
      next_action_at = v_now,
      updated_at = v_now
  WHERE workspace_id = v_project.workspace_id AND id = v_project.business_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_buildstax_feedback(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_buildstax_feedback(TEXT, TEXT, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.create_buildstax_campaign(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT) IS
  'Atomically creates a tenant-scoped campaign and its initial active pitch.';
COMMENT ON FUNCTION public.submit_buildstax_feedback(TEXT, TEXT, TEXT) IS
  'Rate-limited token-scoped customer feedback entrypoint with optional email attribution.';
