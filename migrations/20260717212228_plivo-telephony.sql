CREATE TABLE public.telephony_sessions (
  id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL,
  business_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'Plivo' CHECK (provider = 'Plivo'),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL CHECK (status IN ('requested', 'ringing', 'in_progress', 'completed', 'failed', 'cancelled')),
  mode TEXT NOT NULL CHECK (mode IN ('sandbox', 'live')),
  from_number TEXT NOT NULL CHECK (char_length(from_number) BETWEEN 8 AND 20),
  to_number TEXT NOT NULL CHECK (char_length(to_number) BETWEEN 8 AND 20),
  provider_request_id TEXT,
  provider_call_id TEXT,
  stream_id TEXT,
  transcript TEXT NOT NULL DEFAULT '' CHECK (char_length(transcript) <= 100000),
  error TEXT NOT NULL DEFAULT '' CHECK (char_length(error) <= 2000),
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds BETWEEN 0 AND 86400),
  cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, business_id) REFERENCES public.businesses(workspace_id, id) ON DELETE CASCADE,
  UNIQUE (workspace_id, id)
);

CREATE UNIQUE INDEX telephony_sessions_provider_call_idx
ON public.telephony_sessions(provider_call_id)
WHERE provider_call_id IS NOT NULL;
CREATE INDEX telephony_sessions_business_idx
ON public.telephony_sessions(workspace_id, business_id, created_at DESC);
CREATE INDEX telephony_sessions_status_idx
ON public.telephony_sessions(workspace_id, status, updated_at DESC);

CREATE TABLE public.telephony_events (
  id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 2 AND 80),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 240),
  provider_call_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, session_id) REFERENCES public.telephony_sessions(workspace_id, id) ON DELETE CASCADE,
  UNIQUE (idempotency_key)
);

CREATE INDEX telephony_events_session_idx
ON public.telephony_events(workspace_id, session_id, created_at DESC);

CREATE TRIGGER telephony_sessions_updated_at
BEFORE UPDATE ON public.telephony_sessions
FOR EACH ROW EXECUTE FUNCTION system.update_updated_at();

CREATE TRIGGER telephony_sessions_workspace_guard
BEFORE UPDATE ON public.telephony_sessions
FOR EACH ROW EXECUTE FUNCTION public.prevent_workspace_change();

CREATE TRIGGER telephony_events_workspace_guard
BEFORE UPDATE ON public.telephony_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_workspace_change();

ALTER TABLE public.telephony_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telephony_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY telephony_sessions_select ON public.telephony_sessions
FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id));

CREATE POLICY telephony_events_select ON public.telephony_events
FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id));

REVOKE ALL ON public.telephony_sessions, public.telephony_events FROM anon, authenticated;
GRANT SELECT ON public.telephony_sessions, public.telephony_events TO authenticated;

COMMENT ON TABLE public.telephony_sessions IS
  'Tenant-scoped Plivo call transport state; completed sales outcomes remain in public.calls.';
COMMENT ON TABLE public.telephony_events IS
  'Append-only, idempotent telephony callback and stream lifecycle evidence.';
