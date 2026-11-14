-- Read-only check for the offer_price_basis migration (SCRUM-25 SZPT weighted goods).
-- Run BEFORE and AFTER the migration (never during the 01:00 / 13:00 UTC sync):
--   psql -X -v ON_ERROR_STOP=1 -f ops/postgres/szpt/offer_price_basis_check.sql "$DATABASE_URL"
-- One file, two parts:
--   PRE  works at any time; uses the inline weighted rule copied from
--        backend/prisma/migrations/20261114000000_offer_price_basis/migration.sql
--        (keep in sync with that CASE and pipeline/src/mapping/weight.ts).
--   POST runs only if public.offer_price_basis exists (to_regclass + \if); before the migration
--        it prints a notice and is skipped.
-- The whole script is BEGIN READ ONLY ... ROLLBACK: SELECT only, nothing is written.
-- Needs a role that can read raw_products (owner / migration role), not aktau_api_reader.
-- The last line is GO or STOP: STOP if DINA, ANVAR or DANA has 0 weighted offers in the latest
-- published snapshot (or there is no published snapshot).
--
-- Query timing of the SZPT group query is NOT measured here (EXPLAIN ANALYZE executes the query).
-- To measure it, take szptGroupsSQL from backend-go/internal/postgres/szpt.go and run by hand, e.g.:
--   psql -X -c "EXPLAIN (ANALYZE, BUFFERS) <szptGroupsSQL with $1 = rules jsonb, $2 = snapshot id>" "$DATABASE_URL"
-- (substitute the parameters with literals; see also szptOfferBasisSQL there).

\pset null '(null)'
BEGIN READ ONLY;

\echo
\echo '=== Latest published snapshot ==='
SELECT id AS snapshot_id, "publishedAt"
FROM public.snapshots
WHERE status = 'published' AND "publishedAt" IS NOT NULL
ORDER BY "publishedAt" DESC, id DESC LIMIT 1;

\echo
\echo '=== PRE 1. Per store: offers and weighted offers (inline rule) ==='
-- dana_by_name_only = DANA weighted only by the name (no priceUnit = kg).
WITH snap AS (
  SELECT id FROM public.snapshots WHERE status = 'published' AND "publishedAt" IS NOT NULL
  ORDER BY "publishedAt" DESC, id DESC LIMIT 1
), basis AS (
  SELECT s.code::text AS store, o."inStock", w.weighted,
         (s.code::text = 'DANA' AND w.weighted AND NOT coalesce(r."rawPayload"->>'priceUnit' = 'kg', false)) AS by_name_only
  FROM public.offers o
  JOIN snap ON snap.id = o."snapshotId"
  JOIN public.raw_products r ON r.id = o."rawProductId" AND r."snapshotId" = o."snapshotId"
  JOIN public.stores s ON s.id = o."storeId"
  CROSS JOIN LATERAL (SELECT CASE s.code::text
    WHEN 'DINA'  THEN coalesce(r."rawPayload"->>'price_type' = 'weight', false)
                   OR coalesce(r."rawPayload"->>'isWeightProduct' = 'true', false)
    WHEN 'ANVAR' THEN coalesce(r."rawPayload"->>'priceUnit' = 'kg', false)
    WHEN 'DANA'  THEN coalesce(r."rawPayload"->>'priceUnit' = 'kg', false)
                   OR r."rawName" ~* '(^|[^а-яa-z])вес(ов(ой|ая|ое|ые))?([^а-яa-z]|$)|(^|[^a-z0-9_])PLU\s*[:;]\s*[0-9]+'
    ELSE false END AS weighted) w
)
SELECT store, count(*) AS offers, count(*) FILTER (WHERE "inStock") AS in_stock,
       count(*) FILTER (WHERE weighted) AS weighted,
       count(*) FILTER (WHERE weighted AND "inStock") AS weighted_in_stock,
       count(*) FILTER (WHERE by_name_only) AS dana_by_name_only
FROM basis GROUP BY store ORDER BY store;

\echo
\echo '=== PRE 2. Weighted offers by pricePerUnitMultiplier (basis_grams; 1000 = missing/invalid) ==='
WITH snap AS (
  SELECT id FROM public.snapshots WHERE status = 'published' AND "publishedAt" IS NOT NULL
  ORDER BY "publishedAt" DESC, id DESC LIMIT 1
)
SELECT s.code::text AS store,
       CASE WHEN jsonb_typeof(r."rawPayload"->'pricePerUnitMultiplier') = 'number'
                 AND (r."rawPayload"->>'pricePerUnitMultiplier')::numeric > 0
            THEN (r."rawPayload"->>'pricePerUnitMultiplier')::numeric ELSE 1000 END AS basis_grams,
       count(*) AS weighted_offers
FROM public.offers o
JOIN snap ON snap.id = o."snapshotId"
JOIN public.raw_products r ON r.id = o."rawProductId" AND r."snapshotId" = o."snapshotId"
JOIN public.stores s ON s.id = o."storeId"
CROSS JOIN LATERAL (SELECT CASE s.code::text
    WHEN 'DINA'  THEN coalesce(r."rawPayload"->>'price_type' = 'weight', false)
                   OR coalesce(r."rawPayload"->>'isWeightProduct' = 'true', false)
    WHEN 'ANVAR' THEN coalesce(r."rawPayload"->>'priceUnit' = 'kg', false)
    WHEN 'DANA'  THEN coalesce(r."rawPayload"->>'priceUnit' = 'kg', false)
                   OR r."rawName" ~* '(^|[^а-яa-z])вес(ов(ой|ая|ое|ые))?([^а-яa-z]|$)|(^|[^a-z0-9_])PLU\s*[:;]\s*[0-9]+'
    ELSE false END AS weighted) w
WHERE w.weighted
GROUP BY 1, 2 ORDER BY 1, 2;

\echo
\echo '=== PRE 3. Products whose in-stock offers are ALL weighted (for information; category and price) ==='
WITH snap AS (
  SELECT id FROM public.snapshots WHERE status = 'published' AND "publishedAt" IS NOT NULL
  ORDER BY "publishedAt" DESC, id DESC LIMIT 1
), basis AS (
  SELECT o."canonicalProductId" AS pid, o.price, w.weighted
  FROM public.offers o
  JOIN snap ON snap.id = o."snapshotId"
  JOIN public.raw_products r ON r.id = o."rawProductId" AND r."snapshotId" = o."snapshotId"
  JOIN public.stores s ON s.id = o."storeId"
  CROSS JOIN LATERAL (SELECT CASE s.code::text
    WHEN 'DINA'  THEN coalesce(r."rawPayload"->>'price_type' = 'weight', false)
                   OR coalesce(r."rawPayload"->>'isWeightProduct' = 'true', false)
    WHEN 'ANVAR' THEN coalesce(r."rawPayload"->>'priceUnit' = 'kg', false)
    WHEN 'DANA'  THEN coalesce(r."rawPayload"->>'priceUnit' = 'kg', false)
                   OR r."rawName" ~* '(^|[^а-яa-z])вес(ов(ой|ая|ое|ые))?([^а-яa-z]|$)|(^|[^a-z0-9_])PLU\s*[:;]\s*[0-9]+'
    ELSE false END AS weighted) w
  WHERE o."inStock" AND o.price > 0
)
SELECT c.slug AS category, p.name, min(b.price) AS min_price, count(*) AS offers
FROM basis b
JOIN public.canonical_products p ON p.id = b.pid
JOIN public.categories c ON c.id = p."categoryId"
GROUP BY c.slug, p.id, p.name
HAVING bool_and(b.weighted)
ORDER BY c.slug, p.name COLLATE "ru-x-icu"
LIMIT 300;

\echo
\echo '=== PRE 4. Risk: products with >1 in-stock offer from the SAME store in the latest snapshot ==='
\echo '(offer <-> offer_price_basis matching in the API; same-store duplicates are the risk case)'
WITH snap AS (
  SELECT id FROM public.snapshots WHERE status = 'published' AND "publishedAt" IS NOT NULL
  ORDER BY "publishedAt" DESC, id DESC LIMIT 1
), dup AS (
  SELECT o."canonicalProductId" AS pid, o."storeId", count(*) AS n
  FROM public.offers o JOIN snap ON snap.id = o."snapshotId"
  WHERE o."inStock" GROUP BY 1, 2 HAVING count(*) > 1
)
SELECT (SELECT count(DISTINCT pid) FROM dup) AS products_with_same_store_duplicates;
WITH snap AS (
  SELECT id FROM public.snapshots WHERE status = 'published' AND "publishedAt" IS NOT NULL
  ORDER BY "publishedAt" DESC, id DESC LIMIT 1
)
SELECT p.id AS product_id, p.name, s.code::text AS store, count(*) AS in_stock_offers,
       array_agg(o.price ORDER BY o.price) AS prices
FROM public.offers o
JOIN snap ON snap.id = o."snapshotId"
JOIN public.canonical_products p ON p.id = o."canonicalProductId"
JOIN public.stores s ON s.id = o."storeId"
WHERE o."inStock"
GROUP BY p.id, p.name, s.code
HAVING count(*) > 1
ORDER BY p.name COLLATE "ru-x-icu", s.code::text
LIMIT 100;

-- POST part: only when the view exists.
SELECT to_regclass('public.offer_price_basis') IS NOT NULL AS has_view \gset
\if :has_view
\echo
\echo '=== POST 1. offer_price_basis rows vs offers (latest snapshot); offers must equal view_rows ==='
WITH snap AS (
  SELECT id FROM public.snapshots WHERE status = 'published' AND "publishedAt" IS NOT NULL
  ORDER BY "publishedAt" DESC, id DESC LIMIT 1
)
SELECT (SELECT count(*) FROM public.offers o JOIN snap ON snap.id = o."snapshotId") AS offers,
       (SELECT count(*) FROM public.offer_price_basis b JOIN public.offers o ON o.id = b."offerId"
          JOIN snap ON snap.id = o."snapshotId") AS view_rows,
       (SELECT count(*) FROM public.offer_price_basis b JOIN public.offers o ON o.id = b."offerId"
          JOIN snap ON snap.id = o."snapshotId" WHERE b."soldByWeight") AS view_weighted;

\echo
\echo '=== POST 2. Per store: view weighted offers (compare with PRE 1) ==='
WITH snap AS (
  SELECT id FROM public.snapshots WHERE status = 'published' AND "publishedAt" IS NOT NULL
  ORDER BY "publishedAt" DESC, id DESC LIMIT 1
)
SELECT s.code::text AS store, count(*) AS offers, count(*) FILTER (WHERE b."soldByWeight") AS weighted
FROM public.offers o
JOIN snap ON snap.id = o."snapshotId"
JOIN public.stores s ON s.id = o."storeId"
LEFT JOIN public.offer_price_basis b ON b."offerId" = o.id
GROUP BY s.code ORDER BY s.code::text;
\else
\echo
\echo 'POST skipped: public.offer_price_basis does not exist yet (migration not applied).'
\endif

\echo
\echo '=== VERDICT (STOP if DINA, ANVAR or DANA has 0 weighted offers in the latest published snapshot) ==='
WITH snap AS (
  SELECT id FROM public.snapshots WHERE status = 'published' AND "publishedAt" IS NOT NULL
  ORDER BY "publishedAt" DESC, id DESC LIMIT 1
), weighted AS (
  SELECT s.code::text AS store, count(*) AS n
  FROM public.offers o
  JOIN snap ON snap.id = o."snapshotId"
  JOIN public.raw_products r ON r.id = o."rawProductId" AND r."snapshotId" = o."snapshotId"
  JOIN public.stores s ON s.id = o."storeId"
  CROSS JOIN LATERAL (SELECT CASE s.code::text
    WHEN 'DINA'  THEN coalesce(r."rawPayload"->>'price_type' = 'weight', false)
                   OR coalesce(r."rawPayload"->>'isWeightProduct' = 'true', false)
    WHEN 'ANVAR' THEN coalesce(r."rawPayload"->>'priceUnit' = 'kg', false)
    WHEN 'DANA'  THEN coalesce(r."rawPayload"->>'priceUnit' = 'kg', false)
                   OR r."rawName" ~* '(^|[^а-яa-z])вес(ов(ой|ая|ое|ые))?([^а-яa-z]|$)|(^|[^a-z0-9_])PLU\s*[:;]\s*[0-9]+'
    ELSE false END AS weighted) w
  WHERE w.weighted
  GROUP BY s.code
)
SELECT CASE WHEN (SELECT count(*) FROM snap) = 0 THEN 'STOP'
            WHEN EXISTS (SELECT 1 FROM (VALUES ('DINA'),('ANVAR'),('DANA')) v(store)
                         WHERE coalesce((SELECT n FROM weighted WHERE weighted.store = v.store), 0) = 0)
            THEN 'STOP' ELSE 'GO' END AS verdict;

ROLLBACK;
