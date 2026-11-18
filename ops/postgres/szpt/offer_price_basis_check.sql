-- Read-only check for the offer_price_basis migration (SCRUM-25 SZPT weighted goods).
-- Run BEFORE and AFTER the migration (never during the 01:00 / 13:00 UTC sync):
--   node ops/postgres/psql-run.mjs offer-price-basis-check
-- One file, two parts:
--   PRE  works at any time; uses the inline weighted rule.
--        The rule (weighted CASE, defined ONCE in the :basis_cte variable below) must equal the CASE in
--        backend/prisma/migrations/20261114000000_offer_price_basis/migration.sql and
--        pipeline/src/mapping/weight.ts.
--   POST runs only if public.offer_price_basis exists (to_regclass + \if); before the migration
--        it prints a notice and is skipped.
-- The whole script is one REPEATABLE READ READ ONLY transaction ending in ROLLBACK: SELECT only, nothing
-- is written, every block sees the same data, and statement_timeout (60 s) keeps it from hanging on prod.
-- Needs a role that can read raw_products (owner / migration role), not aktau_api_reader.
-- The last line is GO or STOP. STOP if there is no published snapshot, or DINA, ANVAR or DANA has 0 weighted
-- offers in the latest published snapshot, or (after the migration) the view's rows for that snapshot differ
-- from its offers (view_rows <> offers) or the view disagrees with the inline rule (view_mismatch > 0).
--
-- Query timing of the SZPT queries is NOT measured here. After the migration, run the release gate
-- ops/postgres/szpt/szpt_members_explain.sql as the API role (plan Task 10 Step 4).

\pset null '(null)'
-- The ONLY copy of the weighted rule and of the latest-snapshot filter: CTEs snap and basis.
-- Columns of basis: offer_id, pid, store_id, store, in_stock, price, weighted, by_name_only, basis_grams.
\set basis_cte 'WITH snap AS (SELECT id FROM public.snapshots WHERE status = ''published'' AND "publishedAt" IS NOT NULL ORDER BY "publishedAt" DESC, id DESC LIMIT 1), basis AS (SELECT o.id AS offer_id, o."canonicalProductId" AS pid, o."storeId" AS store_id, s.code::text AS store, o."inStock" AS in_stock, o.price, w.weighted, (s.code::text = ''DANA'' AND w.weighted AND NOT coalesce(r."rawPayload"->>''priceUnit'' = ''kg'', false)) AS by_name_only, CASE WHEN w.weighted THEN CASE WHEN jsonb_typeof(r."rawPayload"->''pricePerUnitMultiplier'') = ''number'' AND (r."rawPayload"->>''pricePerUnitMultiplier'')::numeric > 0 THEN (r."rawPayload"->>''pricePerUnitMultiplier'')::numeric ELSE 1000 END END AS basis_grams FROM public.offers o JOIN snap ON snap.id = o."snapshotId" JOIN public.raw_products r ON r.id = o."rawProductId" AND r."snapshotId" = o."snapshotId" JOIN public.stores s ON s.id = o."storeId" CROSS JOIN LATERAL (SELECT CASE s.code::text WHEN ''DINA'' THEN coalesce(r."rawPayload"->>''price_type'' = ''weight'', false) OR coalesce(r."rawPayload"->>''isWeightProduct'' = ''true'', false) WHEN ''ANVAR'' THEN coalesce(r."rawPayload"->>''priceUnit'' = ''kg'', false) WHEN ''DANA'' THEN coalesce(r."rawPayload"->>''priceUnit'' = ''kg'', false) OR r."rawName" ~* ''(^|[^а-яa-z])вес(ов(ой|ая|ое|ые))?([^а-яa-z]|$)|(^|[^a-z0-9_])PLU\\s*[:;]\\s*[0-9]+'' ELSE false END AS weighted) w)'

BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '60s';

-- POST sets this to true when the view loses, adds or misjudges rows; stays false before the migration.
\set post_stop false

\echo
\echo '=== Latest published snapshot ==='
SELECT id AS snapshot_id, "publishedAt"
FROM public.snapshots
WHERE status = 'published' AND "publishedAt" IS NOT NULL
ORDER BY "publishedAt" DESC, id DESC LIMIT 1;

\echo
\echo '=== PRE 1. Per store: offers and weighted offers (inline rule) ==='
\echo '(dana_by_name_only = DANA weighted only by the name, no priceUnit = kg)'
:basis_cte
SELECT store, count(*) AS offers, count(*) FILTER (WHERE in_stock) AS in_stock,
       count(*) FILTER (WHERE weighted) AS weighted,
       count(*) FILTER (WHERE weighted AND in_stock) AS weighted_in_stock,
       count(*) FILTER (WHERE by_name_only) AS dana_by_name_only
FROM basis GROUP BY store ORDER BY store;

\echo
\echo '=== PRE 2. Weighted offers by pricePerUnitMultiplier (basis_grams; 1000 = missing/invalid) ==='
:basis_cte
SELECT store, basis_grams, count(*) AS weighted_offers
FROM basis WHERE weighted GROUP BY 1, 2 ORDER BY 1, 2;

\echo
\echo '=== PRE 3. Live SZPT groups (categories milk, dairy, groats, oil, eggs): products whose in-stock offers are ALL weighted ==='
\echo '--- count per category'
:basis_cte
SELECT c.slug AS category, count(*) AS all_weighted_products FROM (
  SELECT pid FROM basis WHERE in_stock AND price > 0 GROUP BY pid HAVING bool_and(weighted)) x
JOIN public.canonical_products p ON p.id = x.pid
JOIN public.categories c ON c.id = p."categoryId"
WHERE c.slug IN ('milk', 'dairy', 'groats', 'oil', 'eggs')
GROUP BY c.slug ORDER BY c.slug;
\echo '--- list'
:basis_cte
SELECT c.slug AS category, p.name, min(b.price) AS min_price, count(*) AS offers
FROM basis b
JOIN public.canonical_products p ON p.id = b.pid
JOIN public.categories c ON c.id = p."categoryId"
WHERE b.in_stock AND b.price > 0 AND c.slug IN ('milk', 'dairy', 'groats', 'oil', 'eggs')
GROUP BY c.slug, p.id, p.name
HAVING bool_and(b.weighted)
ORDER BY c.slug, p.name COLLATE "ru-x-icu";

\echo
\echo '=== PRE 4. Risk: products with >1 in-stock offer from the SAME store in the latest snapshot ==='
\echo '(offer <-> offer_price_basis matching in the API; same-store duplicates are the risk case)'
:basis_cte
SELECT count(DISTINCT pid) AS products_with_same_store_duplicates FROM (
  SELECT pid FROM basis WHERE in_stock GROUP BY pid, store_id HAVING count(*) > 1) d;
:basis_cte
SELECT p.id AS product_id, p.name, b.store, count(*) AS in_stock_offers, array_agg(b.price ORDER BY b.price) AS prices
FROM basis b JOIN public.canonical_products p ON p.id = b.pid
WHERE b.in_stock
GROUP BY p.id, p.name, b.store_id, b.store
HAVING count(*) > 1
ORDER BY p.name COLLATE "ru-x-icu", b.store
LIMIT 100;

-- POST part: only when the view exists.
SELECT to_regclass('public.offer_price_basis') IS NOT NULL AS has_view \gset
\if :has_view
\echo
\echo '=== POST 1. offer_price_basis rows vs offers (latest snapshot); offers must equal view_rows ==='
\echo '(view_rows = view rows with the latest snapshotId; view_mismatch = offers missing from the view or'
\echo ' where the view disagrees with the inline rule; must be 0; post_stop = true means STOP)'
:basis_cte
SELECT x.offers, x.view_rows, x.view_weighted, x.view_mismatch,
       (x.view_rows <> x.offers OR x.view_mismatch > 0) AS post_stop
FROM (SELECT count(*) AS offers,
             (SELECT count(*) FROM public.offer_price_basis
              WHERE "snapshotId" = (SELECT id FROM snap)) AS view_rows,
             count(*) FILTER (WHERE v."soldByWeight") AS view_weighted,
             count(*) FILTER (WHERE v."offerId" IS NULL OR v."soldByWeight" IS DISTINCT FROM b.weighted
                              OR v."basisGrams" IS DISTINCT FROM b.basis_grams) AS view_mismatch
      FROM basis b LEFT JOIN public.offer_price_basis v
        ON v."offerId" = b.offer_id AND v."snapshotId" = (SELECT id FROM snap)) x \gset
\echo 'offers' :offers 'view_rows' :view_rows 'view_weighted' :view_weighted 'view_mismatch' :view_mismatch 'post_stop' :post_stop

\echo
\echo '=== POST 2. Per store: view weighted offers (compare with PRE 1) ==='
:basis_cte
SELECT b.store, count(*) AS offers, count(*) FILTER (WHERE v."soldByWeight") AS weighted
FROM basis b LEFT JOIN public.offer_price_basis v
  ON v."offerId" = b.offer_id AND v."snapshotId" = (SELECT id FROM snap)
GROUP BY b.store ORDER BY b.store;
\else
\echo
\echo 'POST skipped: public.offer_price_basis does not exist yet (migration not applied).'
\endif

\echo
\echo '=== VERDICT (STOP: no published snapshot; DINA, ANVAR or DANA with 0 weighted offers; POST post_stop) ==='
:basis_cte
SELECT CASE WHEN (SELECT count(*) FROM snap) = 0 THEN 'STOP'
            WHEN EXISTS (SELECT 1 FROM (VALUES ('DINA'),('ANVAR'),('DANA')) v(store)
                         WHERE (SELECT count(*) FROM basis WHERE basis.store = v.store AND weighted) = 0)
            THEN 'STOP'
            WHEN :'post_stop'::boolean THEN 'STOP'
            ELSE 'GO' END AS verdict;

ROLLBACK;
