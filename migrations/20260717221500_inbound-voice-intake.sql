-- Admit inbound sessions only for deterministic phone-intake records. Outbound
-- DNC and callable-stage enforcement remains unchanged.

CREATE OR REPLACE FUNCTION public.guard_telephony_session_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business public.businesses%ROWTYPE;
BEGIN
  SELECT * INTO v_business
  FROM public.businesses
  WHERE workspace_id = NEW.workspace_id AND id = NEW.business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business not found';
  END IF;
  IF v_business.do_not_call OR v_business.stage = 'dnc' THEN
    RAISE EXCEPTION 'Calling is permanently blocked for this business';
  END IF;

  IF NEW.direction = 'inbound' THEN
    IF v_business.source <> 'inbound_phone'
       OR v_business.phone <> NEW.from_number
       OR NEW.provider_call_id IS NULL
       OR NEW.status <> 'in_progress' THEN
      RAISE EXCEPTION 'Inbound session does not match the dedicated intake workflow';
    END IF;
    RETURN NEW;
  END IF;

  IF v_business.stage NOT IN ('call_ready', 'contacted', 'interested', 'quoted', 'payment_pending') THEN
    RAISE EXCEPTION 'Business is not in a callable stage';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_telephony_session_insert() FROM PUBLIC;
COMMENT ON FUNCTION public.guard_telephony_session_insert() IS
  'Allows verified caller-initiated intake sessions and preserves outbound DNC and stage enforcement.';
