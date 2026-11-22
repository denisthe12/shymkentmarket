-- Gramad: second chain. Registers the store and teaches offer_price_basis its weight rule.
-- Rule = pipeline/src/mapping/weight.ts isVariableWeight; change both together.
-- No store_locations: real addresses are separate approved work.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

INSERT INTO public.stores (id, code, name, "logoUrl", "sortOrder")
VALUES ('10671cc4-9b83-48a4-bc8d-d1e3b510ab47', 'GRAMAD', 'Gramad', NULL, 20);

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
-- Magnum and Gramad: weighted items carry rawPayload.isWeighted = true and a price per 1 kg.
CREATE OR REPLACE VIEW public.offer_price_basis AS
SELECT o.id AS "offerId",
       w.weighted AS "soldByWeight",
       CASE WHEN w.weighted THEN 1000::numeric END AS "basisGrams",
       o."snapshotId" AS "snapshotId"
FROM public.offers o
JOIN public.raw_products r ON r.id = o."rawProductId" AND r."snapshotId" = o."snapshotId"
JOIN public.stores s ON s.id = o."storeId"
CROSS JOIN LATERAL (SELECT CASE
  WHEN s.code IN ('MAGNUM', 'GRAMAD') THEN coalesce(r."rawPayload"->>'isWeighted' = 'true', false)
  ELSE false END AS weighted) w;

REVOKE ALL ON public.offer_price_basis FROM PUBLIC;
DO $revoke$ BEGIN
  IF to_regrole('anon') IS NOT NULL THEN REVOKE ALL ON public.offer_price_basis FROM anon; END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN REVOKE ALL ON public.offer_price_basis FROM authenticated; END IF;
END $revoke$;
DO $grant$ BEGIN
  IF to_regrole('aktau_api_reader') IS NOT NULL THEN GRANT SELECT ON public.offer_price_basis TO aktau_api_reader; END IF;
END $grant$;

COMMIT;
