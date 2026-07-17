-- Keep outbound voice reservations compliant and callback state monotonic even
-- when provider requests arrive concurrently or out of order.

ALTER TABLE public.telephony_sessions
  ADD CONSTRAINT telephony_sessions_id_format
    CHECK (id ~ '^tel_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
  ADD CONSTRAINT telephony_sessions_provider_request_length
    CHECK (provider_request_id IS NULL OR char_length(provider_request_id) BETWEEN 8 AND 160),
  ADD CONSTRAINT telephony_sessions_provider_call_length
    CHECK (provider_call_id IS NULL OR char_length(provider_call_id) BETWEEN 8 AND 160),
  ADD CONSTRAINT telephony_sessions_stream_length
    CHECK (stream_id IS NULL OR char_length(stream_id) BETWEEN 8 AND 160);

ALTER TABLE public.telephony_events
  ADD CONSTRAINT telephony_events_id_format
    CHECK (id ~ '^tev_[0-9a-fA-F-]{36}$'),
  ADD CONSTRAINT telephony_events_provider_call_length
    CHECK (provider_call_id IS NULL OR char_length(provider_call_id) BETWEEN 8 AND 160),
  ADD CONSTRAINT telephony_events_payload_size
    CHECK (pg_column_size(payload) <= 16384);

CREATE UNIQUE INDEX telephony_sessions_one_active_business_idx
ON public.telephony_sessions(workspace_id, business_id)
WHERE status IN ('requested', 'ringing', 'in_progress');

CREATE OR REPLACE FUNCTION public.guard_telephony_session_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business public.businesses%ROWTYPE;
BEGIN
  IF NEW.direction <> 'outbound' THEN
    RAISE EXCEPTION 'Inbound telephony sessions require the dedicated inbound workflow';
  END IF;

  SELECT * INTO v_business
  FROM public.businesses
  WHERE workspace_id = NEW.workspace_id AND id = NEW.business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business not found';
  END IF;
  IF v_business.do_not_call OR v_business.stage = 'dnc' THEN
    RAISE EXCEPTION 'Outbound calling is permanently blocked for this business';
  END IF;
  IF v_business.stage NOT IN ('call_ready', 'contacted', 'interested', 'quoted', 'payment_pending') THEN
    RAISE EXCEPTION 'Business is not in a callable stage';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER telephony_sessions_outbound_guard
BEFORE INSERT ON public.telephony_sessions
FOR EACH ROW EXECUTE FUNCTION public.guard_telephony_session_insert();

CREATE OR REPLACE FUNCTION public.guard_telephony_session_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF OLD.status IN ('completed', 'failed', 'cancelled') AND NEW.status <> OLD.status THEN
    NEW.status := OLD.status;
  ELSIF OLD.status = 'in_progress' AND NEW.status IN ('requested', 'ringing') THEN
    NEW.status := OLD.status;
  ELSIF OLD.status = 'ringing' AND NEW.status = 'requested' THEN
    NEW.status := OLD.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER telephony_sessions_status_guard
BEFORE UPDATE OF status ON public.telephony_sessions
FOR EACH ROW EXECUTE FUNCTION public.guard_telephony_session_status();

DROP POLICY telephony_sessions_select ON public.telephony_sessions;
CREATE POLICY telephony_sessions_select ON public.telephony_sessions
FOR SELECT TO authenticated
USING (public.can_mutate_workspace(workspace_id));

DROP POLICY telephony_events_select ON public.telephony_events;
CREATE POLICY telephony_events_select ON public.telephony_events
FOR SELECT TO authenticated
USING (public.can_mutate_workspace(workspace_id));

REVOKE ALL ON FUNCTION public.guard_telephony_session_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_telephony_session_status() FROM PUBLIC;

COMMENT ON FUNCTION public.guard_telephony_session_insert() IS
  'Rechecks permanent DNC and callable-stage rules at the database write boundary.';
COMMENT ON INDEX public.telephony_sessions_one_active_business_idx IS
  'Prevents concurrent call submissions from creating multiple active calls for one business.';
