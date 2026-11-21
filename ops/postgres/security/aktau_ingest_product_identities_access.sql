-- Operator artifact, not a Prisma migration and NOT applied by runtime.
-- Gives the ingestion group access to public.product_identities: SELECT+INSERT+UPDATE only.
-- No DELETE or TRUNCATE; no other role gets access here.
-- Apply AFTER migration 20261122000000_shymkent_baseline and AFTER aktau_ingest_writer_role.sql
-- in the same database. Rollback: rollback_aktau_ingest_product_identities_access.sql, which must
-- run BEFORE rollback_aktau_ingest_writer_access.sql.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='10s';
LOCK TABLE public.product_identities IN ACCESS EXCLUSIVE MODE;
DO $guard$ BEGIN
 IF to_regrole('aktau_ingest_writer') IS NULL THEN
  RAISE EXCEPTION 'aktau_ingest_writer is missing; apply aktau_ingest_writer_role.sql first'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.product_identities'::regclass AND relrowsecurity AND NOT relforcerowsecurity) THEN
  RAISE EXCEPTION 'product_identities must have RLS enabled'; END IF;
 IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.product_identities'::regclass) THEN
  RAISE EXCEPTION 'product_identities already has policies'; END IF;
END $guard$;
GRANT SELECT,INSERT,UPDATE ON public.product_identities TO aktau_ingest_writer;
CREATE POLICY aktau_ingest_writer_select ON public.product_identities FOR SELECT TO aktau_ingest_writer USING (true);
CREATE POLICY aktau_ingest_writer_insert ON public.product_identities FOR INSERT TO aktau_ingest_writer WITH CHECK (true);
CREATE POLICY aktau_ingest_writer_update ON public.product_identities FOR UPDATE TO aktau_ingest_writer USING (true) WITH CHECK (true);
COMMIT;
