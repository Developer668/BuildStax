-- Keep Stripe test and live fulfillment on separate verified webhook paths.

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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_buildstax_stripe_environment ON payments.webhook_events;
CREATE TRIGGER validate_buildstax_stripe_environment
BEFORE INSERT OR UPDATE OF processing_status ON payments.webhook_events
FOR EACH ROW
EXECUTE FUNCTION public.validate_buildstax_stripe_environment();

REVOKE ALL ON FUNCTION public.validate_buildstax_stripe_environment() FROM PUBLIC;

COMMENT ON FUNCTION public.validate_buildstax_stripe_environment() IS
  'Rejects BuildStax payment events whose signed checkout environment crosses the InsForge webhook environment.';
