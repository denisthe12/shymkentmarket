-- Operator artifact, not a Prisma migration. Fills public.product_identities once, before the new
-- ingest code goes live, and again after a code rollback. Safe to repeat. Deletes nothing.
-- Snapshots run second because they are newer than the monthly history.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
INSERT INTO public.product_identities("storeId","sourceProductId","canonicalProductId","lastSeenAt")
SELECT DISTINCT ON (h."storeId",h."sourceProductId") h."storeId",h."sourceProductId",h."canonicalProductId",h."capturedAt"
FROM public.price_history h
ORDER BY h."storeId",h."sourceProductId",h.month DESC,h."capturedAt" DESC
ON CONFLICT ("storeId","sourceProductId") DO NOTHING;
INSERT INTO public.product_identities("storeId","sourceProductId","canonicalProductId","lastSeenAt")
SELECT DISTINCT ON (r."storeId",r."sourceProductId") r."storeId",r."sourceProductId",m."canonicalProductId",s."publishedAt"
FROM public.raw_products r
JOIN public.product_mappings m ON m."rawProductId"=r.id
JOIN public.snapshots s ON s.id=r."snapshotId"
WHERE s.status='published' AND s."publishedAt" IS NOT NULL
ORDER BY r."storeId",r."sourceProductId",s."publishedAt" DESC,s.id DESC
ON CONFLICT ("storeId","sourceProductId") DO UPDATE SET "canonicalProductId"=EXCLUDED."canonicalProductId","lastSeenAt"=EXCLUDED."lastSeenAt";
COMMIT;
