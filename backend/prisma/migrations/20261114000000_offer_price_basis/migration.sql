-- Price basis per offer: sold by weight (price per kg) or per piece.
-- The view runs with the owner's rights, so the API reader sees three columns and never raw_products.

DO $guard$
DECLARE
    raw_owner oid;
    raw_forced boolean;
BEGIN
    SELECT relowner, relforcerowsecurity INTO raw_owner, raw_forced
    FROM pg_catalog.pg_class WHERE oid = 'public.raw_products'::regclass;
    IF raw_forced THEN
        RAISE EXCEPTION 'raw_products has FORCE ROW LEVEL SECURITY: offer_price_basis would return no rows';
    END IF;
    -- The view owner is the migration role; it must read raw_products past RLS.
    IF NOT pg_catalog.pg_has_role(current_user, raw_owner, 'USAGE')
       AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
                       WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
        RAISE EXCEPTION 'Migration role must own raw_products or bypass RLS: offer_price_basis would return no rows';
    END IF;
END
$guard$;

-- Rule = pipeline/src/mapping/weight.ts isVariableWeight; change both together.
CREATE VIEW public.offer_price_basis AS
SELECT o.id AS "offerId",
       w.weighted AS "soldByWeight",
       CASE WHEN w.weighted THEN
         CASE WHEN jsonb_typeof(r."rawPayload"->'pricePerUnitMultiplier') = 'number'
                   AND (r."rawPayload"->>'pricePerUnitMultiplier')::numeric > 0
              THEN (r."rawPayload"->>'pricePerUnitMultiplier')::numeric ELSE 1000 END
       END AS "basisGrams"
FROM public.offers o
JOIN public.raw_products r ON r.id = o."rawProductId" AND r."snapshotId" = o."snapshotId"
JOIN public.stores s ON s.id = o."storeId"
CROSS JOIN LATERAL (SELECT CASE s.code::text
  WHEN 'DINA'  THEN coalesce(r."rawPayload"->>'price_type' = 'weight', false)
                 OR coalesce(r."rawPayload"->>'isWeightProduct' = 'true', false)
  WHEN 'ANVAR' THEN coalesce(r."rawPayload"->>'priceUnit' = 'kg', false)
  WHEN 'DANA'  THEN coalesce(r."rawPayload"->>'priceUnit' = 'kg', false)
                 OR r."rawName" ~* '(^|[^а-яa-z])вес(ов(ой|ая|ое|ые))?([^а-яa-z]|$)|(^|[^a-z0-9_])PLU\s*[:;]\s*[0-9]+'
  ELSE false END AS weighted) w;

REVOKE ALL ON public.offer_price_basis FROM PUBLIC;
DO $revoke$ BEGIN
  IF to_regrole('anon') IS NOT NULL THEN REVOKE ALL ON public.offer_price_basis FROM anon; END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN REVOKE ALL ON public.offer_price_basis FROM authenticated; END IF;
END $revoke$;
DO $grant$ BEGIN
  IF to_regrole('aktau_api_reader') IS NOT NULL THEN GRANT SELECT ON public.offer_price_basis TO aktau_api_reader; END IF;
END $grant$;
