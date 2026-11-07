-- Operator artifact, not a Prisma migration. Removes only the retention group's access to
-- public.price_history (two policies, SELECT+INSERT). Keeps the table and its data.
-- Run BEFORE rollback_aktau_retention_writer_access.sql, whose guard expects 10 policies.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='10s';
LOCK TABLE public.price_history IN ACCESS EXCLUSIVE MODE;
DO $guard$
DECLARE w oid := to_regrole('aktau_retention_writer')::oid;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'aktau_retention_writer is missing'; END IF;
 IF (SELECT count(*) FROM pg_policy WHERE polrelid='public.price_history'::regclass)<>2
 OR NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid='public.price_history'::regclass AND p.polname='aktau_retention_writer_select' AND p.polcmd='r' AND p.polpermissive AND p.polroles=ARRAY[w] AND pg_get_expr(p.polqual,p.polrelid)='true' AND p.polwithcheck IS NULL)
 OR NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid='public.price_history'::regclass AND p.polname='aktau_retention_writer_insert' AND p.polcmd='a' AND p.polpermissive AND p.polroles=ARRAY[w] AND p.polqual IS NULL AND pg_get_expr(p.polwithcheck,p.polrelid)='true'
 ) THEN RAISE EXCEPTION 'price_history retention policy drift'; END IF;
 IF (SELECT count(*) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.oid='public.price_history'::regclass AND w IN(a.grantee,a.grantor))<>2
 OR (SELECT count(*) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.oid='public.price_history'::regclass AND a.grantee=w AND a.privilege_type IN('SELECT','INSERT') AND NOT a.is_grantable)<>2
 THEN RAISE EXCEPTION 'price_history retention privilege drift'; END IF;
END $guard$;
DROP POLICY aktau_retention_writer_select ON public.price_history;
DROP POLICY aktau_retention_writer_insert ON public.price_history;
REVOKE SELECT,INSERT ON public.price_history FROM aktau_retention_writer;
COMMIT;
