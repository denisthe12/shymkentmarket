-- Operator artifact: one-off import of monthly prices into public.price_history from a CSV.
-- Run by the database owner through psql, never by runtime. Only INSERTs; it never deletes or updates.
-- Existing (month, storeId, canonicalProductId) rows win (ON CONFLICT DO NOTHING), so reruns add nothing.
-- A (month, storeId) already stored with a different capturedAt than the CSV aborts the import: a month must come from one capture.
-- The CSV must have a header row with exactly these columns:
--   month,storeId,canonicalProductId,sourceProductId,rawName,price,oldPrice,reviewStatus,capturedAt,snapshotId,createdAt
-- psql \copy does not expand variables, so the CSV comes on stdin (pstdin, because -f makes STDIN the script itself):
--   node ops/postgres/psql-run.mjs import-price-history < history.csv
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TEMP TABLE price_history_import (LIKE public.price_history INCLUDING DEFAULTS) ON COMMIT DROP;
\copy price_history_import ("month","storeId","canonicalProductId","sourceProductId","rawName","price","oldPrice","reviewStatus","capturedAt","snapshotId","createdAt") FROM pstdin WITH (FORMAT csv, HEADER match)
DO $guard$ BEGIN
  IF EXISTS (
    SELECT 1 FROM price_history_import i
    JOIN public.price_history h ON h."month"=i."month" AND h."storeId"=i."storeId"
    WHERE h."capturedAt" <> i."capturedAt"
  ) THEN
    RAISE EXCEPTION 'price_history already has a different capture for a (month, storeId) in this CSV; import aborted';
  END IF;
END $guard$;
INSERT INTO public.price_history ("month","storeId","canonicalProductId","sourceProductId","rawName","price","oldPrice","reviewStatus","capturedAt","snapshotId","createdAt")
SELECT "month","storeId","canonicalProductId","sourceProductId","rawName","price","oldPrice","reviewStatus","capturedAt","snapshotId","createdAt"
FROM price_history_import
ON CONFLICT ("month","storeId","canonicalProductId") DO NOTHING;
SELECT "month", count(*) FROM public.price_history GROUP BY "month" ORDER BY "month";
COMMIT;
