-- BuildStax operational schema. InsForge is the system of record; all private
-- data is tenant-scoped and protected by row-level security.

CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  default_pricing_floor_cents INTEGER NOT NULL DEFAULT 150000 CHECK (default_pricing_floor_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'CAD', 'EUR', 'GBP')),
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles' CHECK (char_length(timezone) BETWEEN 3 AND 80),
  require_call_before_email BOOLEAN NOT NULL DEFAULT TRUE,
  block_dnc_outreach BOOLEAN NOT NULL DEFAULT TRUE,
  require_payment_before_build BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.workspace_members (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('owner', 'operator', 'viewer')),
  email TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 320),
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX workspace_members_user_idx ON public.workspace_members(user_id, created_at);

CREATE TABLE public.campaigns (
  id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  vertical TEXT NOT NULL CHECK (char_length(vertical) BETWEEN 2 AND 120),
  region TEXT NOT NULL CHECK (char_length(region) BETWEEN 2 AND 160),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  daily_lead_limit INTEGER NOT NULL DEFAULT 20 CHECK (daily_lead_limit BETWEEN 1 AND 500),
  daily_spend_cap_cents INTEGER NOT NULL DEFAULT 2500 CHECK (daily_spend_cap_cents BETWEEN 0 AND 100000000),
  pricing_floor_cents INTEGER NOT NULL DEFAULT 150000 CHECK (pricing_floor_cents > 0),
  pitch_script TEXT NOT NULL CHECK (char_length(pitch_script) BETWEEN 40 AND 8000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, name)
);

CREATE INDEX campaigns_workspace_status_idx ON public.campaigns(workspace_id, status);

CREATE TABLE public.pitch_versions (
  id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL,
  campaign_id TEXT NOT NULL,
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 2 AND 80),
  script TEXT NOT NULL CHECK (char_length(script) BETWEEN 40 AND 8000),
  status TEXT NOT NULL CHECK (status IN ('active', 'challenger', 'retired')),
  calls INTEGER NOT NULL DEFAULT 0 CHECK (calls >= 0),
  positive_outcomes INTEGER NOT NULL DEFAULT 0 CHECK (positive_outcomes BETWEEN 0 AND calls),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, campaign_id) REFERENCES public.campaigns(workspace_id, id) ON DELETE CASCADE,
  UNIQUE (workspace_id, id)
);

CREATE INDEX pitch_versions_campaign_idx ON public.pitch_versions(workspace_id, campaign_id, created_at DESC);

CREATE TABLE public.businesses (
  id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id TEXT,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  category TEXT NOT NULL CHECK (char_length(category) BETWEEN 2 AND 120),
  location TEXT NOT NULL CHECK (char_length(location) BETWEEN 2 AND 160),
  address TEXT NOT NULL DEFAULT '' CHECK (char_length(address) <= 500),
  contact_name TEXT NOT NULL DEFAULT '' CHECK (char_length(contact_name) <= 120),
  phone TEXT NOT NULL DEFAULT '' CHECK (char_length(phone) <= 40),
  email TEXT NOT NULL DEFAULT '' CHECK (char_length(email) <= 320),
  website_status TEXT NOT NULL DEFAULT 'unknown' CHECK (website_status IN ('none', 'stale', 'active', 'unknown')),
  source TEXT NOT NULL CHECK (char_length(source) BETWEEN 2 AND 80),
  source_ref TEXT NOT NULL DEFAULT '' CHECK (char_length(source_ref) <= 500),
  stage TEXT NOT NULL DEFAULT 'discovered' CHECK (stage IN ('discovered', 'qualified', 'call_ready', 'contacted', 'interested', 'quoted', 'payment_pending', 'paid', 'building', 'review', 'delivered', 'won', 'lost', 'dnc')),
  score INTEGER NOT NULL DEFAULT 50 CHECK (score BETWEEN 0 AND 100),
  do_not_call BOOLEAN NOT NULL DEFAULT FALSE,
  estimated_site_cost_cents INTEGER NOT NULL DEFAULT 90000 CHECK (estimated_site_cost_cents > 0),
  requirements TEXT NOT NULL DEFAULT '' CHECK (char_length(requirements) <= 12000),
  preferred_style TEXT NOT NULL DEFAULT '' CHECK (char_length(preferred_style) <= 4000),
  next_action TEXT NOT NULL DEFAULT 'Review prospect' CHECK (char_length(next_action) <= 500),
  next_action_at TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, campaign_id) REFERENCES public.campaigns(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id)
);

CREATE INDEX businesses_workspace_stage_idx ON public.businesses(workspace_id, stage, score DESC);
CREATE INDEX businesses_workspace_campaign_idx ON public.businesses(workspace_id, campaign_id);
CREATE INDEX businesses_workspace_next_action_idx ON public.businesses(workspace_id, next_action_at);

CREATE TABLE public.calls (
  id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL,
  business_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'in_progress', 'completed', 'failed', 'cancelled')),
  outcome TEXT NOT NULL CHECK (char_length(outcome) BETWEEN 2 AND 80),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 8 AND 8000),
  transcript TEXT NOT NULL DEFAULT '' CHECK (char_length(transcript) <= 100000),
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds BETWEEN 0 AND 86400),
  provider TEXT NOT NULL CHECK (char_length(provider) BETWEEN 2 AND 120),
  mode TEXT NOT NULL CHECK (mode IN ('sandbox', 'live', 'manual')),
  cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, business_id) REFERENCES public.businesses(workspace_id, id) ON DELETE CASCADE,
  UNIQUE (workspace_id, id)
);

CREATE INDEX calls_business_idx ON public.calls(workspace_id, business_id, created_at DESC);

CREATE TABLE public.quotes (
  id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL,
  business_id TEXT NOT NULL,
  estimated_cost_cents INTEGER NOT NULL CHECK (estimated_cost_cents > 0),
  configured_floor_cents INTEGER NOT NULL CHECK (configured_floor_cents > 0),
  multiplier_floor_cents INTEGER NOT NULL CHECK (multiplier_floor_cents > 0),
  enforced_floor_cents INTEGER NOT NULL CHECK (enforced_floor_cents > 0),
  proposed_price_cents INTEGER NOT NULL CHECK (proposed_price_cents > 0),
  scope TEXT NOT NULL CHECK (char_length(scope) BETWEEN 20 AND 12000),
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'accepted', 'expired', 'declined')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, business_id) REFERENCES public.businesses(workspace_id, id) ON DELETE CASCADE,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, business_id, id),
  CHECK (proposed_price_cents >= enforced_floor_cents)
);

CREATE INDEX quotes_business_idx ON public.quotes(workspace_id, business_id, created_at DESC);

CREATE TABLE public.payments (
  id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL,
  business_id TEXT NOT NULL,
  quote_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'refunded', 'failed')),
  provider TEXT NOT NULL CHECK (char_length(provider) BETWEEN 2 AND 120),
  reference TEXT NOT NULL CHECK (char_length(reference) BETWEEN 4 AND 200),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, business_id, quote_id) REFERENCES public.quotes(workspace_id, business_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, quote_id),
  UNIQUE (workspace_id, reference),
  CHECK ((status = 'paid' AND paid_at IS NOT NULL) OR status <> 'paid')
);

CREATE INDEX payments_business_idx ON public.payments(workspace_id, business_id, created_at DESC);

CREATE TABLE public.projects (
  id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL,
  business_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'building', 'review', 'delivered', 'complete')),
  brief TEXT NOT NULL CHECK (char_length(brief) BETWEEN 20 AND 12000),
  preview_token TEXT NOT NULL CHECK (char_length(preview_token) BETWEEN 24 AND 200),
  production_url TEXT CHECK (production_url IS NULL OR production_url ~ '^https://'),
  revision_count INTEGER NOT NULL DEFAULT 0 CHECK (revision_count >= 0),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, business_id) REFERENCES public.businesses(workspace_id, id) ON DELETE CASCADE,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, business_id),
  UNIQUE (preview_token)
);

CREATE TABLE public.messages (
  id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL,
  business_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'internal')),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'preview', 'note')),
  status TEXT NOT NULL CHECK (char_length(status) BETWEEN 2 AND 80),
  subject TEXT NOT NULL DEFAULT '' CHECK (char_length(subject) <= 500),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 2 AND 20000),
  provider TEXT NOT NULL CHECK (char_length(provider) BETWEEN 2 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, business_id) REFERENCES public.businesses(workspace_id, id) ON DELETE CASCADE,
  UNIQUE (workspace_id, id)
);

CREATE INDEX messages_business_idx ON public.messages(workspace_id, business_id, created_at DESC);

CREATE TABLE public.automation_runs (
  id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (char_length(type) BETWEEN 2 AND 80),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'blocked')),
  provider TEXT NOT NULL CHECK (char_length(provider) BETWEEN 2 AND 120),
  mode TEXT NOT NULL CHECK (mode IN ('sandbox', 'live', 'manual')),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 2 AND 4000),
  spend_cents INTEGER NOT NULL DEFAULT 0 CHECK (spend_cents >= 0),
  error TEXT NOT NULL DEFAULT '' CHECK (char_length(error) <= 4000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(metadata) <= 1048576),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  UNIQUE (workspace_id, id)
);

CREATE INDEX automation_runs_started_idx ON public.automation_runs(workspace_id, started_at DESC);

CREATE TABLE public.audit_events (
  id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL CHECK (char_length(actor_id) BETWEEN 2 AND 160),
  action TEXT NOT NULL CHECK (char_length(action) BETWEEN 2 AND 160),
  entity_type TEXT NOT NULL CHECK (char_length(entity_type) BETWEEN 2 AND 80),
  entity_id TEXT NOT NULL CHECK (char_length(entity_id) BETWEEN 1 AND 200),
  detail TEXT NOT NULL CHECK (char_length(detail) BETWEEN 2 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id)
);

CREATE INDEX audit_events_created_idx ON public.audit_events(workspace_id, created_at DESC);

CREATE TABLE public.rate_limits (
  key TEXT PRIMARY KEY CHECK (char_length(key) BETWEEN 8 AND 220),
  count INTEGER NOT NULL CHECK (count > 0),
  window_started_at TIMESTAMPTZ NOT NULL
);

CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members AS wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.can_mutate_workspace(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members AS wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = (SELECT auth.uid())
      AND wm.role IN ('owner', 'operator')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_owner(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members AS wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = (SELECT auth.uid())
      AND wm.role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_workspace(
  p_name TEXT,
  p_email TEXT,
  p_display_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_workspace_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF char_length(trim(p_name)) NOT BETWEEN 2 AND 80
     OR char_length(trim(p_email)) NOT BETWEEN 3 AND 320
     OR char_length(trim(p_display_name)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Invalid workspace profile';
  END IF;

  SELECT wm.workspace_id INTO v_workspace_id
  FROM public.workspace_members AS wm
  WHERE wm.user_id = v_user_id
  ORDER BY wm.created_at
  LIMIT 1;

  IF v_workspace_id IS NOT NULL THEN
    RETURN v_workspace_id;
  END IF;

  INSERT INTO public.workspaces (name, created_by)
  VALUES (trim(p_name), v_user_id)
  RETURNING id INTO v_workspace_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role, email, display_name)
  VALUES (v_workspace_id, v_user_id, 'owner', lower(trim(p_email)), trim(p_display_name));

  INSERT INTO public.audit_events (id, workspace_id, actor_id, action, entity_type, entity_id, detail)
  VALUES (
    'aud_' || gen_random_uuid()::text,
    v_workspace_id,
    v_user_id::text,
    'workspace.created',
    'workspace',
    v_workspace_id::text,
    'Created the operator workspace.'
  );

  RETURN v_workspace_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_workspace_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION 'workspace_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_call_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business public.businesses%ROWTYPE;
BEGIN
  SELECT * INTO v_business FROM public.businesses
  WHERE workspace_id = NEW.workspace_id AND id = NEW.business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business not found';
  END IF;
  IF v_business.do_not_call OR v_business.stage = 'dnc' THEN
    RAISE EXCEPTION 'Outreach is blocked for this business';
  END IF;
  IF v_business.phone = '' THEN
    RAISE EXCEPTION 'A phone number is required before a call can be recorded';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_quote_floor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business public.businesses%ROWTYPE;
  v_workspace_floor INTEGER;
  v_campaign_floor INTEGER;
  v_require_call BOOLEAN;
BEGIN
  SELECT * INTO v_business FROM public.businesses
  WHERE workspace_id = NEW.workspace_id AND id = NEW.business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business not found';
  END IF;
  IF v_business.do_not_call OR v_business.stage = 'dnc' THEN
    RAISE EXCEPTION 'Quotes are blocked for this business';
  END IF;

  SELECT default_pricing_floor_cents, require_call_before_email
    INTO v_workspace_floor, v_require_call
  FROM public.workspaces WHERE id = NEW.workspace_id;

  SELECT pricing_floor_cents INTO v_campaign_floor
  FROM public.campaigns
  WHERE workspace_id = NEW.workspace_id AND id = v_business.campaign_id;

  IF v_require_call AND NOT EXISTS (
    SELECT 1 FROM public.calls
    WHERE workspace_id = NEW.workspace_id
      AND business_id = NEW.business_id
      AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'A completed phone call is required before quoting';
  END IF;

  NEW.configured_floor_cents := greatest(v_workspace_floor, coalesce(v_campaign_floor, v_workspace_floor));
  NEW.multiplier_floor_cents := NEW.estimated_cost_cents * 2;
  NEW.enforced_floor_cents := greatest(NEW.configured_floor_cents, NEW.multiplier_floor_cents);
  IF NEW.proposed_price_cents < NEW.enforced_floor_cents THEN
    RAISE EXCEPTION 'Proposed price is below the enforced floor';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_payment_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_quote public.quotes%ROWTYPE;
BEGIN
  SELECT * INTO v_quote FROM public.quotes
  WHERE workspace_id = NEW.workspace_id
    AND business_id = NEW.business_id
    AND id = NEW.quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;
  IF NEW.status = 'paid' AND NEW.amount_cents <> v_quote.proposed_price_cents THEN
    RAISE EXCEPTION 'Paid amount must match the accepted quote';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_project_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_require_payment BOOLEAN;
BEGIN
  SELECT require_payment_before_build INTO v_require_payment
  FROM public.workspaces WHERE id = NEW.workspace_id;
  IF v_require_payment AND NOT EXISTS (
    SELECT 1 FROM public.payments
    WHERE workspace_id = NEW.workspace_id
      AND business_id = NEW.business_id
      AND status = 'paid'
  ) THEN
    RAISE EXCEPTION 'Payment is required before a build can start';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business public.businesses%ROWTYPE;
  v_workspace public.workspaces%ROWTYPE;
BEGIN
  IF NEW.direction <> 'outbound' OR NEW.channel <> 'email' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_business FROM public.businesses
  WHERE workspace_id = NEW.workspace_id AND id = NEW.business_id;
  SELECT * INTO v_workspace FROM public.workspaces WHERE id = NEW.workspace_id;
  IF v_workspace.block_dnc_outreach AND (v_business.do_not_call OR v_business.stage = 'dnc') THEN
    RAISE EXCEPTION 'Outbound email is blocked for this business';
  END IF;
  IF v_workspace.require_call_before_email AND NOT EXISTS (
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

CREATE OR REPLACE FUNCTION public.get_buildstax_preview(p_token TEXT)
RETURNS TABLE (
  project_id TEXT,
  project_status TEXT,
  revision_count INTEGER,
  business_id TEXT,
  business_name TEXT,
  category TEXT,
  location TEXT,
  phone TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT p.id, p.status, p.revision_count, b.id, b.name, b.category, b.location, b.phone
  FROM public.projects AS p
  JOIN public.businesses AS b
    ON b.workspace_id = p.workspace_id AND b.id = p.business_id
  WHERE p.preview_token = p_token
    AND p.status IN ('review', 'delivered', 'complete')
  LIMIT 1;
$$;

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
BEGIN
  IF p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR char_length(p_email) > 320
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
    'Preview feedback from ' || lower(trim(p_email)),
    trim(p_feedback),
    'Customer preview'
  );

  UPDATE public.projects
  SET status = 'review', revision_count = revision_count + 1, updated_at = v_now
  WHERE workspace_id = v_project.workspace_id AND id = v_project.id;

  UPDATE public.businesses
  SET stage = 'review', next_action = 'Review customer feedback', next_action_at = v_now, updated_at = v_now
  WHERE workspace_id = v_project.workspace_id AND id = v_project.business_id;

  INSERT INTO public.audit_events (id, workspace_id, actor_id, action, entity_type, entity_id, detail)
  VALUES (
    'aud_' || gen_random_uuid()::text,
    v_project.workspace_id,
    'customer',
    'feedback.received',
    'business',
    v_project.business_id,
    'Customer submitted feedback from the private preview.'
  );

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.buildstax_health()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT TRUE; $$;

CREATE TRIGGER workspaces_updated_at BEFORE UPDATE ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION system.update_updated_at();
CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION system.update_updated_at();
CREATE TRIGGER businesses_updated_at BEFORE UPDATE ON public.businesses
FOR EACH ROW EXECUTE FUNCTION system.update_updated_at();
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION system.update_updated_at();

CREATE TRIGGER calls_guard BEFORE INSERT ON public.calls
FOR EACH ROW EXECUTE FUNCTION public.guard_call_insert();
CREATE TRIGGER quotes_floor_guard
BEFORE INSERT OR UPDATE OF estimated_cost_cents, proposed_price_cents, business_id, workspace_id ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.enforce_quote_floor();
CREATE TRIGGER payments_guard
BEFORE INSERT OR UPDATE OF amount_cents, status, quote_id, business_id, workspace_id ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.guard_payment_insert();
CREATE TRIGGER projects_payment_guard BEFORE INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.guard_project_insert();
CREATE TRIGGER messages_outreach_guard BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.guard_message_insert();

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'campaigns', 'pitch_versions', 'businesses', 'calls', 'quotes',
    'payments', 'projects', 'messages', 'automation_runs', 'audit_events'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_workspace_change()',
      v_table || '_workspace_guard',
      v_table
    );
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_table TEXT;
  v_policy RECORD;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'workspaces', 'workspace_members', 'campaigns', 'pitch_versions', 'businesses',
    'calls', 'quotes', 'payments', 'projects', 'messages', 'automation_runs',
    'audit_events', 'rate_limits'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    FOR v_policy IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = v_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy.policyname, v_table);
    END LOOP;
  END LOOP;
END;
$$;

CREATE POLICY workspaces_select ON public.workspaces
FOR SELECT TO authenticated USING (public.is_workspace_member(id));
CREATE POLICY workspaces_update ON public.workspaces
FOR UPDATE TO authenticated
USING (public.can_mutate_workspace(id))
WITH CHECK (public.can_mutate_workspace(id));

CREATE POLICY workspace_members_select ON public.workspace_members
FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'campaigns', 'pitch_versions', 'businesses', 'calls', 'quotes',
    'payments', 'projects', 'messages', 'automation_runs'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id))',
      v_table || '_select',
      v_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_mutate_workspace(workspace_id))',
      v_table || '_insert',
      v_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.can_mutate_workspace(workspace_id)) WITH CHECK (public.can_mutate_workspace(workspace_id))',
      v_table || '_update',
      v_table
    );
  END LOOP;
END;
$$;

CREATE POLICY audit_events_select ON public.audit_events
FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY audit_events_insert ON public.audit_events
FOR INSERT TO authenticated WITH CHECK (public.can_mutate_workspace(workspace_id));

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.workspaces, public.workspace_members TO authenticated;
GRANT UPDATE (
  name, default_pricing_floor_cents, currency, timezone,
  require_call_before_email, block_dnc_outreach, require_payment_before_build
) ON public.workspaces TO authenticated;
GRANT SELECT, INSERT, UPDATE ON
  public.campaigns, public.pitch_versions, public.businesses, public.calls,
  public.quotes, public.payments, public.projects, public.messages,
  public.automation_runs TO authenticated;
GRANT SELECT, INSERT ON public.audit_events TO authenticated;

REVOKE ALL ON FUNCTION public.is_workspace_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_mutate_workspace(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_workspace_owner(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_workspace(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_buildstax_preview(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_buildstax_feedback(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.buildstax_health() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_workspace_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_mutate_workspace(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_workspace(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_buildstax_preview(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_buildstax_feedback(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buildstax_health() TO anon, authenticated;

COMMENT ON FUNCTION public.get_buildstax_preview(TEXT) IS
  'Returns only the public preview projection for a high-entropy review token.';
COMMENT ON FUNCTION public.submit_buildstax_feedback(TEXT, TEXT, TEXT) IS
  'Rate-limited customer feedback entrypoint scoped to a high-entropy review token.';
