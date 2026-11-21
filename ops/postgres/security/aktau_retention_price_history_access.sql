-- Operator artifact, not a Prisma migration and NOT applied by runtime.
-- Gives the retention group append-only access to public.price_history: SELECT+INSERT only.
-- No UPDATE, DELETE or TRUNCATE; no other role gets access here.
-- Apply AFTER migration 20261122000000_shymkent_baseline and AFTER aktau_retention_writer_role.sql
-- in the same database. Rollback: rollback_aktau_retention_price_history_access.sql, which must
-- run BEFORE rollback_aktau_retention_writer_access.sql.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='10s';
LOCK TABLE public.price_history IN ACCESS EXCLUSIVE MODE;
DO $guard$ BEGIN
 IF to_regrole('aktau_retention_writer') IS NULL THEN
  RAISE EXCEPTION 'aktau_retention_writer is missing; apply aktau_retention_writer_role.sql first'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.price_history'::regclass AND relrowsecurity AND NOT relforcerowsecurity) THEN
  RAISE EXCEPTION 'price_history must have RLS enabled'; END IF;
 IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.price_history'::regclass) THEN
  RAISE EXCEPTION 'price_history already has policies'; END IF;
END $guard$;
GRANT SELECT,INSERT ON public.price_history TO aktau_retention_writer;
CREATE POLICY aktau_retention_writer_select ON public.price_history FOR SELECT TO aktau_retention_writer USING (true);
CREATE POLICY aktau_retention_writer_insert ON public.price_history FOR INSERT TO aktau_retention_writer WITH CHECK (true);
COMMIT;
