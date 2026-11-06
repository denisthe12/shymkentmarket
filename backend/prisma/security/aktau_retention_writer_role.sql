-- Separate operator-only retention group bootstrap; never runtime/migration LOGIN.
-- Grants only SELECT+DELETE on the five snapshot-scoped tables. No INSERT/UPDATE,
-- no access to stores/categories/canonical_products/store_locations.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='10s';
LOCK TABLE public.snapshots,public.source_runs,public.raw_products,public.product_mappings,public.offers IN ACCESS EXCLUSIVE MODE;
-- Operator/bootstrap artifact. NOT a Prisma migration and NOT applied by runtime.
-- Provision this cluster-global group AFTER snapshot_history, before LOGINs.
DO $bootstrap$
DECLARE
    writer pg_catalog.pg_roles%ROWTYPE;
BEGIN
    SELECT * INTO writer FROM pg_catalog.pg_roles WHERE rolname = 'aktau_retention_writer';
    IF NOT FOUND THEN
        CREATE ROLE aktau_retention_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
            NOREPLICATION NOBYPASSRLS INHERIT;
        SELECT * INTO writer FROM pg_catalog.pg_roles WHERE rolname = 'aktau_retention_writer';
    END IF;
    -- Validate both existing and newly-created roles. PostgreSQL 17 adds a
    -- non-superuser creator's admin-only anchor automatically; never clean it up.
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member = writer.oid)
       OR NOT (
           ((SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user)
            AND (SELECT count(*) FROM pg_catalog.pg_auth_members WHERE roleid = writer.oid) = 0)
           OR
           ((SELECT NOT rolsuper AND rolcreaterole FROM pg_catalog.pg_roles WHERE rolname = current_user)
            AND (SELECT count(*) FROM pg_catalog.pg_auth_members WHERE roleid = writer.oid) = 1
            AND EXISTS (
                SELECT 1 FROM pg_catalog.pg_auth_members m
                JOIN pg_catalog.pg_roles grantor ON grantor.oid = m.grantor
                WHERE m.roleid = writer.oid
                  AND m.member = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
                  AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
                  AND grantor.rolsuper))
       ) THEN
        RAISE EXCEPTION 'Retention writer must have only the exact current-operator admin anchor or no members for a superuser';
    END IF;
    IF writer.rolcanlogin OR writer.rolsuper OR writer.rolcreatedb
       OR writer.rolcreaterole OR writer.rolreplication OR writer.rolbypassrls
       OR NOT writer.rolinherit THEN
        RAISE EXCEPTION 'aktau_retention_writer has unexpected security attributes';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relowner = writer.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspowner = writer.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datdba = writer.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE proowner = writer.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_type WHERE typowner = writer.oid) THEN
        RAISE EXCEPTION 'aktau_retention_writer must have no owned objects';
    END IF;
    -- PUBLIC-only privileges are not direct writer grants. Check both
    -- recipient and grantor, including defaults owned by the writer.
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_database d
            CROSS JOIN LATERAL pg_catalog.aclexplode(d.datacl) a
            WHERE writer.oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n
            CROSS JOIN LATERAL pg_catalog.aclexplode(n.nspacl) a
            WHERE writer.oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c
            CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
            WHERE writer.oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute c
            CROSS JOIN LATERAL pg_catalog.aclexplode(c.attacl) a
            WHERE writer.oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
            CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) a
            WHERE writer.oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_type t
            CROSS JOIN LATERAL pg_catalog.aclexplode(t.typacl) a
            WHERE writer.oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl d WHERE d.defaclrole = writer.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl d
            CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a
            WHERE writer.oid IN (a.grantee,a.grantor)) THEN
        RAISE EXCEPTION 'aktau_retention_writer must have no pre-existing direct or default privileges';
    END IF;
END
$bootstrap$;

-- Reader baseline only: other groups (e.g. aktau_ingest_writer) may already hold policies.
DO $baseline$ BEGIN
 IF (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('stores','store_locations','categories','raw_products','canonical_products','product_mappings','offers','snapshots','source_runs') AND relrowsecurity AND NOT relforcerowsecurity)<>9
 OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles=ARRAY['aktau_api_reader']::name[] AND cmd='SELECT' AND qual='true' AND with_check IS NULL)<>6 THEN
 RAISE EXCEPTION 'Snapshot security baseline drift'; END IF;
 END $baseline$;
GRANT USAGE ON SCHEMA public TO aktau_retention_writer;
GRANT SELECT,DELETE ON public.snapshots TO aktau_retention_writer;
CREATE POLICY aktau_retention_writer_select ON public.snapshots FOR SELECT TO aktau_retention_writer USING (true);
CREATE POLICY aktau_retention_writer_delete ON public.snapshots FOR DELETE TO aktau_retention_writer USING (true);
GRANT SELECT,DELETE ON public.source_runs TO aktau_retention_writer;
CREATE POLICY aktau_retention_writer_select ON public.source_runs FOR SELECT TO aktau_retention_writer USING (true);
CREATE POLICY aktau_retention_writer_delete ON public.source_runs FOR DELETE TO aktau_retention_writer USING (true);
GRANT SELECT,DELETE ON public.raw_products TO aktau_retention_writer;
CREATE POLICY aktau_retention_writer_select ON public.raw_products FOR SELECT TO aktau_retention_writer USING (true);
CREATE POLICY aktau_retention_writer_delete ON public.raw_products FOR DELETE TO aktau_retention_writer USING (true);
GRANT SELECT,DELETE ON public.product_mappings TO aktau_retention_writer;
CREATE POLICY aktau_retention_writer_select ON public.product_mappings FOR SELECT TO aktau_retention_writer USING (true);
CREATE POLICY aktau_retention_writer_delete ON public.product_mappings FOR DELETE TO aktau_retention_writer USING (true);
GRANT SELECT,DELETE ON public.offers TO aktau_retention_writer;
CREATE POLICY aktau_retention_writer_select ON public.offers FOR SELECT TO aktau_retention_writer USING (true);
CREATE POLICY aktau_retention_writer_delete ON public.offers FOR DELETE TO aktau_retention_writer USING (true);
COMMIT;
