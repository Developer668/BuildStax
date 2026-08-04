-- Customer preview feedback creates a new revision and invalidates any prior
-- external deployment evidence before the operator can deliver again.
CREATE OR REPLACE FUNCTION public.invalidate_buildstax_preview_deployment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.direction = 'inbound' AND NEW.channel = 'preview' THEN
    UPDATE public.projects
    SET status = 'review',
        production_url = NULL,
        delivered_at = NULL,
        updated_at = now()
    WHERE workspace_id = NEW.workspace_id
      AND business_id = NEW.business_id
      AND status IN ('review', 'delivered', 'complete');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.invalidate_buildstax_preview_deployment() FROM PUBLIC;

DROP TRIGGER IF EXISTS messages_preview_reopens_delivery ON public.messages;
CREATE TRIGGER messages_preview_reopens_delivery
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.invalidate_buildstax_preview_deployment();

COMMENT ON FUNCTION public.invalidate_buildstax_preview_deployment() IS
  'Clears stale deployment evidence when customer preview feedback opens a new revision.';
