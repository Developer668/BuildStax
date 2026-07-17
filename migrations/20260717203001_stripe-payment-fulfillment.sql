-- Fulfill BuildStax quotes only from Stripe events verified by InsForge.
-- The Checkout success URL is intentionally not trusted for fulfillment.

CREATE OR REPLACE FUNCTION public.fulfill_buildstax_stripe_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, payments, pg_temp
AS $$
DECLARE
  v_object JSONB;
  v_metadata JSONB;
  v_workspace_id UUID;
  v_business_id TEXT;
  v_quote_id TEXT;
  v_amount_cents INTEGER;
  v_currency TEXT;
  v_payment_reference TEXT;
  v_quote public.quotes%ROWTYPE;
  v_payment_id TEXT;
  v_inserted_rows INTEGER := 0;
BEGIN
  IF NEW.provider <> 'stripe' OR NEW.processing_status <> 'processed' THEN
    RETURN NEW;
  END IF;

  v_object := NEW.payload #> '{data,object}';
  IF v_object IS NULL OR jsonb_typeof(v_object) <> 'object' THEN
    RETURN NEW;
  END IF;

  v_metadata := COALESCE(v_object -> 'metadata', '{}'::jsonb);

  -- Full refunds revoke the paid ledger entry without rolling back delivery state.
  IF NEW.event_type = 'charge.refunded'
     AND COALESCE((v_object ->> 'refunded')::BOOLEAN, FALSE) THEN
    v_payment_reference := NULLIF(v_object ->> 'payment_intent', '');
    IF v_payment_reference IS NULL THEN
      RETURN NEW;
    END IF;

    UPDATE public.payments
    SET status = 'refunded'
    WHERE provider IN ('Stripe test', 'Stripe')
      AND reference = v_payment_reference
      AND status = 'paid'
    RETURNING id, workspace_id, business_id
    INTO v_payment_id, v_workspace_id, v_business_id;

    IF v_payment_id IS NOT NULL THEN
      INSERT INTO public.audit_events (
        id, workspace_id, actor_id, action, entity_type, entity_id, detail
      ) VALUES (
        'aud_stripe_' || md5(NEW.provider_event_id || ':refunded'),
        v_workspace_id,
        'stripe:webhook',
        'payment.refunded',
        'business',
        v_business_id,
        'Stripe reported a full refund. Delivery state was preserved for operator review.'
      ) ON CONFLICT (id) DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.event_type NOT IN (
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'payment_intent.succeeded'
  ) OR v_metadata ->> 'buildstax_application' <> 'buildstax' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(v_metadata ->> 'buildstax_workspace_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'Stripe event has an invalid BuildStax workspace reference';
  END IF;

  v_workspace_id := (v_metadata ->> 'buildstax_workspace_id')::UUID;
  v_business_id := NULLIF(v_metadata ->> 'buildstax_business_id', '');
  v_quote_id := NULLIF(v_metadata ->> 'buildstax_quote_id', '');
  IF v_business_id IS NULL OR v_quote_id IS NULL THEN
    RAISE EXCEPTION 'Stripe event is missing BuildStax correlation metadata';
  END IF;

  v_amount_cents := CASE NEW.event_type
    WHEN 'payment_intent.succeeded' THEN NULLIF(v_object ->> 'amount_received', '')::INTEGER
    ELSE NULLIF(v_object ->> 'amount_total', '')::INTEGER
  END;
  v_currency := lower(COALESCE(v_object ->> 'currency', ''));
  v_payment_reference := CASE NEW.event_type
    WHEN 'payment_intent.succeeded' THEN NULLIF(v_object ->> 'id', '')
    ELSE NULLIF(v_object ->> 'payment_intent', '')
  END;

  IF NEW.event_type <> 'payment_intent.succeeded'
     AND COALESCE(v_object ->> 'payment_status', '') <> 'paid' THEN
    RETURN NEW;
  END IF;
  IF v_amount_cents IS NULL OR v_payment_reference IS NULL OR v_currency <> 'usd' THEN
    RAISE EXCEPTION 'Stripe event has incomplete payment evidence';
  END IF;

  SELECT * INTO v_quote
  FROM public.quotes
  WHERE workspace_id = v_workspace_id
    AND business_id = v_business_id
    AND id = v_quote_id
  FOR UPDATE;

  IF NOT FOUND OR v_quote.status NOT IN ('sent', 'accepted') THEN
    RAISE EXCEPTION 'Stripe event does not match an open BuildStax quote';
  END IF;
  IF v_quote.proposed_price_cents <> v_amount_cents THEN
    RAISE EXCEPTION 'Stripe amount does not match the accepted BuildStax quote';
  END IF;

  v_payment_id := 'pay_stripe_' || md5(v_workspace_id::TEXT || ':' || v_quote_id);
  INSERT INTO public.payments (
    id, workspace_id, business_id, quote_id, amount_cents, status,
    provider, reference, paid_at, created_at
  ) VALUES (
    v_payment_id,
    v_workspace_id,
    v_business_id,
    v_quote_id,
    v_amount_cents,
    'paid',
    CASE WHEN NEW.environment = 'test' THEN 'Stripe test' ELSE 'Stripe' END,
    v_payment_reference,
    COALESCE(NEW.processed_at, now()),
    COALESCE(NEW.processed_at, now())
  )
  ON CONFLICT (workspace_id, quote_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  IF v_inserted_rows > 0 THEN
    UPDATE public.quotes
    SET status = 'accepted'
    WHERE workspace_id = v_workspace_id AND id = v_quote_id;

    UPDATE public.businesses
    SET stage = 'paid', next_action = 'Start build', next_action_at = now()
    WHERE workspace_id = v_workspace_id
      AND id = v_business_id
      AND stage IN ('quoted', 'payment_pending');

    INSERT INTO public.audit_events (
      id, workspace_id, actor_id, action, entity_type, entity_id, detail
    ) VALUES (
      'aud_stripe_' || md5(NEW.provider_event_id || ':paid'),
      v_workspace_id,
      'stripe:webhook',
      'payment.recorded',
      'business',
      v_business_id,
      'InsForge verified Stripe payment against the accepted quote.'
    ) ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fulfill_buildstax_stripe_payment ON payments.webhook_events;
CREATE TRIGGER fulfill_buildstax_stripe_payment
AFTER INSERT OR UPDATE OF processing_status ON payments.webhook_events
FOR EACH ROW
EXECUTE FUNCTION public.fulfill_buildstax_stripe_event();

REVOKE ALL ON FUNCTION public.fulfill_buildstax_stripe_event() FROM PUBLIC;

COMMENT ON FUNCTION public.fulfill_buildstax_stripe_event() IS
  'Idempotently fulfills floor-safe quotes from Stripe events verified by InsForge.';
