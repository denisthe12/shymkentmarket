-- Guarded access-only rollback. Remove known retention LOGIN membership first.
-- Does not remove snapshots/history/schema/data or touch the API reader or ingest writer.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='10s';
LOCK TABLE public.snapshots,public.source_runs,public.raw_products,public.product_mappings,public.offers IN ACCESS EXCLUSIVE MODE;
DO $guard$
DECLARE writer pg_roles%ROWTYPE; t text;
BEGIN
 SELECT * INTO writer FROM pg_roles WHERE rolname='aktau_retention_writer';
 IF NOT FOUND OR writer.rolcanlogin OR writer.rolsuper OR writer.rolcreatedb OR writer.rolcreaterole OR writer.rolreplication OR writer.rolbypassrls OR NOT writer.rolinherit
 OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=writer.oid)
 OR EXISTS(SELECT 1 FROM pg_class WHERE relowner=writer.oid)
 OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=writer.oid)
 OR EXISTS(SELECT 1 FROM pg_database WHERE datdba=writer.oid)
 OR EXISTS(SELECT 1 FROM pg_proc WHERE proowner=writer.oid)
 OR EXISTS(SELECT 1 FROM pg_type WHERE typowner=writer.oid) THEN RAISE EXCEPTION 'Retention writer role security drift'; END IF;
 IF NOT (
 ((SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid=writer.oid))
 OR ((SELECT NOT rolsuper AND rolcreaterole FROM pg_roles WHERE rolname=current_user)
 AND (SELECT count(*) FROM pg_auth_members WHERE roleid=writer.oid)=1
 AND EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.grantor WHERE m.roleid=writer.oid AND m.member=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option AND g.rolsuper))
 ) THEN RAISE EXCEPTION 'Remove runtime members; retain only exact operator admin anchor'; END IF;
 IF (SELECT count(*) FROM pg_policy WHERE writer.oid=ANY(polroles))<>10
 OR (SELECT count(*) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE writer.oid IN(a.grantee,a.grantor))<>10
 OR (SELECT count(*) FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl)a WHERE writer.oid IN(a.grantee,a.grantor))<>1
 OR NOT EXISTS(SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl)a WHERE n.nspname='public' AND a.grantee=writer.oid AND a.privilege_type='USAGE' AND NOT a.is_grantable)
 OR EXISTS(SELECT 1 FROM pg_attribute c CROSS JOIN LATERAL aclexplode(c.attacl)a WHERE writer.oid IN(a.grantee,a.grantor))
 OR EXISTS(SELECT 1 FROM pg_database c CROSS JOIN LATERAL aclexplode(c.datacl)a WHERE writer.oid IN(a.grantee,a.grantor))
 OR EXISTS(SELECT 1 FROM pg_proc c CROSS JOIN LATERAL aclexplode(c.proacl)a WHERE writer.oid IN(a.grantee,a.grantor))
 OR EXISTS(SELECT 1 FROM pg_type c CROSS JOIN LATERAL aclexplode(c.typacl)a WHERE writer.oid IN(a.grantee,a.grantor))
 OR EXISTS(SELECT 1 FROM pg_default_acl c WHERE c.defaclrole=writer.oid)
 OR EXISTS(SELECT 1 FROM pg_default_acl c CROSS JOIN LATERAL aclexplode(c.defaclacl)a WHERE writer.oid IN(a.grantee,a.grantor)) THEN RAISE EXCEPTION 'Retention writer ACL/policy drift'; END IF;
 FOREACH t IN ARRAY ARRAY['snapshots','source_runs','raw_products','product_mappings','offers'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace AND c.relname=t AND p.polname='aktau_retention_writer_select' AND p.polcmd='r' AND p.polpermissive AND p.polroles=ARRAY[writer.oid] AND pg_get_expr(p.polqual,p.polrelid)='true' AND p.polwithcheck IS NULL)
  OR NOT EXISTS(SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace AND c.relname=t AND p.polname='aktau_retention_writer_delete' AND p.polcmd='d' AND p.polpermissive AND p.polroles=ARRAY[writer.oid] AND pg_get_expr(p.polqual,p.polrelid)='true' AND p.polwithcheck IS NULL)
  OR (SELECT count(*) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.relnamespace='public'::regnamespace AND c.relname=t AND a.grantee=writer.oid AND a.privilege_type IN ('SELECT','DELETE') AND NOT a.is_grantable)<>2
  THEN RAISE EXCEPTION 'Retention writer exact privilege/policy mismatch on %', t; END IF;
 END LOOP;
END $guard$;
DROP POLICY aktau_retention_writer_select ON public.snapshots;
DROP POLICY aktau_retention_writer_delete ON public.snapshots;
REVOKE SELECT,DELETE ON public.snapshots FROM aktau_retention_writer;
DROP POLICY aktau_retention_writer_select ON public.source_runs;
DROP POLICY aktau_retention_writer_delete ON public.source_runs;
REVOKE SELECT,DELETE ON public.source_runs FROM aktau_retention_writer;
DROP POLICY aktau_retention_writer_select ON public.raw_products;
DROP POLICY aktau_retention_writer_delete ON public.raw_products;
REVOKE SELECT,DELETE ON public.raw_products FROM aktau_retention_writer;
DROP POLICY aktau_retention_writer_select ON public.product_mappings;
DROP POLICY aktau_retention_writer_delete ON public.product_mappings;
REVOKE SELECT,DELETE ON public.product_mappings FROM aktau_retention_writer;
DROP POLICY aktau_retention_writer_select ON public.offers;
DROP POLICY aktau_retention_writer_delete ON public.offers;
REVOKE SELECT,DELETE ON public.offers FROM aktau_retention_writer;
REVOKE USAGE ON SCHEMA public FROM aktau_retention_writer;
DROP ROLE aktau_retention_writer;
COMMIT;
