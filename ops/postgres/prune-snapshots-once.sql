-- Разовая очистка: оставляет 14 последних опубликованных снимков. Запускать повторно, пока victims > 0.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $guard$ BEGIN
  IF NOT pg_try_advisory_xact_lock(71791791920392) THEN RAISE EXCEPTION 'ingestion running'; END IF;
END $guard$;
CREATE TEMP TABLE victims ON COMMIT DROP AS
  SELECT id FROM (
    SELECT id, row_number() OVER (ORDER BY "publishedAt" DESC, id DESC) rn
    FROM public.snapshots WHERE status='published' AND "publishedAt" IS NOT NULL
  ) ranked WHERE rn > 14 ORDER BY rn DESC LIMIT 8;
DELETE FROM public.offers WHERE "snapshotId" IN (SELECT id FROM victims);
DELETE FROM public.product_mappings m USING public.raw_products r
  WHERE m."rawProductId"=r.id AND r."snapshotId" IN (SELECT id FROM victims);
DELETE FROM public.raw_products WHERE "snapshotId" IN (SELECT id FROM victims);
DELETE FROM public.source_runs WHERE "snapshotId" IN (SELECT id FROM victims);
DELETE FROM public.snapshots WHERE id IN (SELECT id FROM victims);
SELECT count(*) AS victims FROM victims;
COMMIT;
