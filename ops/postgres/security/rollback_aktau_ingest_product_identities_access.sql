-- Operator artifact, not a Prisma migration. Removes only the ingestion group's access to
-- public.product_identities (three policies, SELECT+INSERT+UPDATE). Keeps the table and its data.
-- Run BEFORE rollback_aktau_ingest_writer_access.sql, whose guard expects exactly 17 policies.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='10s';
LOCK TABLE public.product_identities IN ACCESS EXCLUSIVE MODE;
DO $guard$
DECLARE w oid := to_regrole('aktau_ingest_writer')::oid;
BEGIN
 IF w IS NULL THEN RAISE EXCEPTION 'aktau_ingest_writer is missing'; END IF;
 IF (SELECT count(*) FROM pg_policy WHERE polrelid='public.product_identities'::regclass)<>3
 OR NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid='public.product_identities'::regclass AND p.polname='aktau_ingest_writer_select' AND p.polcmd='r' AND p.polpermissive AND p.polroles=ARRAY[w] AND pg_get_expr(p.polqual,p.polrelid)='true' AND p.polwithcheck IS NULL)
 OR NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid='public.product_identities'::regclass AND p.polname='aktau_ingest_writer_insert' AND p.polcmd='a' AND p.polpermissive AND p.polroles=ARRAY[w] AND p.polqual IS NULL AND pg_get_expr(p.polwithcheck,p.polrelid)='true')
 OR NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid='public.product_identities'::regclass AND p.polname='aktau_ingest_writer_update' AND p.polcmd='w' AND p.polpermissive AND p.polroles=ARRAY[w] AND pg_get_expr(p.polqual,p.polrelid)='true' AND pg_get_expr(p.polwithcheck,p.polrelid)='true')
 THEN RAISE EXCEPTION 'product_identities ingestion policy drift'; END IF;
 IF (SELECT count(*) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.oid='public.product_identities'::regclass AND w IN(a.grantee,a.grantor))<>3
 OR (SELECT count(*) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.oid='public.product_identities'::regclass AND a.grantee=w AND a.privilege_type IN('SELECT','INSERT','UPDATE') AND NOT a.is_grantable)<>3
 THEN RAISE EXCEPTION 'product_identities ingestion privilege drift'; END IF;
END $guard$;
DROP POLICY aktau_ingest_writer_select ON public.product_identities;
DROP POLICY aktau_ingest_writer_insert ON public.product_identities;
DROP POLICY aktau_ingest_writer_update ON public.product_identities;
REVOKE SELECT,INSERT,UPDATE ON public.product_identities FROM aktau_ingest_writer;
COMMIT;
