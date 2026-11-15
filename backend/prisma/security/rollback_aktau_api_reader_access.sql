-- Operator-only emergency rollback; NOT a Prisma migration or runtime action.
-- Separately approved execution only. Remove the known runtime LOGIN first.
-- Removes every reader object the migrations create: SELECT policy and grant on the 5 Part04 runtime
-- tables and on snapshots (20261005000000_snapshot_history), the offer_price_basis view grant
-- (20261114000000_offer_price_basis), schema USAGE, then the role. Other roles' policies and grants
-- (aktau_ingest_writer, retention) are not touched and not counted. Data untouched.
-- Every check and destructive step is atomic; unexpected drift aborts everything.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10s';

LOCK TABLE public.stores, public.store_locations, public.categories,
    public.raw_products, public.canonical_products, public.product_mappings,
    public.offers, public.snapshots IN ACCESS EXCLUSIVE MODE;

-- The offer_price_basis view grant is outside the guarded table ACLs below: drop it first.
DO $view$ BEGIN
    IF to_regclass('public.offer_price_basis') IS NOT NULL THEN
        REVOKE ALL ON public.offer_price_basis FROM aktau_api_reader;
    END IF;
END $view$;

DO $guard$
DECLARE
    reader pg_catalog.pg_roles%ROWTYPE;
    runtime_tables text[] := ARRAY['stores','store_locations','categories','canonical_products','offers'];
    app_tables text[] := runtime_tables || ARRAY['raw_products','product_mappings'];
    -- Part04 runtime tables plus snapshots (20261005000000_snapshot_history).
    reader_tables text[] := runtime_tables || ARRAY['snapshots'];
BEGIN
    SELECT * INTO reader FROM pg_catalog.pg_roles WHERE rolname = 'aktau_api_reader';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rollback requires the reviewed reader rollout state';
    END IF;
    IF reader.rolcanlogin OR reader.rolsuper OR reader.rolcreatedb
       OR reader.rolcreaterole OR reader.rolreplication OR reader.rolbypassrls
       OR NOT reader.rolinherit
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member = reader.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relowner = reader.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspowner = reader.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datdba = reader.oid) THEN
        RAISE EXCEPTION 'Reader role attributes, membership or ownership drift';
    END IF;
    -- Runtime must be removed first, but the exact admin-only creator anchor
    -- remains until DROP ROLE. It is not an inherited/settable runtime grant.
    IF NOT (
           ((SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user)
            AND (SELECT count(*) FROM pg_catalog.pg_auth_members WHERE roleid = reader.oid) = 0)
           OR
           ((SELECT NOT rolsuper AND rolcreaterole FROM pg_catalog.pg_roles WHERE rolname = current_user)
            AND (SELECT count(*) FROM pg_catalog.pg_auth_members WHERE roleid = reader.oid) = 1
            AND EXISTS (
                SELECT 1 FROM pg_catalog.pg_auth_members m
                JOIN pg_catalog.pg_roles grantor ON grantor.oid = m.grantor
                WHERE m.roleid = reader.oid
                  AND m.member = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
                  AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
                  AND grantor.rolsuper))
       ) THEN
        RAISE EXCEPTION 'Remove runtime members; only the exact current-operator admin anchor may remain';
    END IF;
    IF (SELECT count(*) FROM pg_catalog.pg_class
        WHERE relnamespace = 'public'::regnamespace AND relname = ANY(app_tables)
          AND relkind = 'r' AND relrowsecurity AND NOT relforcerowsecurity) <> 7 THEN
        RAISE EXCEPTION 'Application RLS baseline drift';
    END IF;
    -- Count only reader policies: exactly the six reviewed SELECT policies, nothing else names the reader.
    IF (SELECT count(*) FROM pg_catalog.pg_policy p WHERE reader.oid=ANY(p.polroles)) <> 6
       OR (SELECT count(*) FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
           WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY(reader_tables)
             AND p.polname='aktau_api_reader_select' AND p.polcmd='r' AND p.polpermissive
             AND p.polroles=ARRAY[reader.oid] AND pg_catalog.pg_get_expr(p.polqual,p.polrelid)='true'
             AND p.polwithcheck IS NULL) <> 6 THEN
        RAISE EXCEPTION 'Reader policy drift';
    END IF;
    -- Check direct ACLs, not effective privileges (PUBLIC USAGE/CONNECT are preserved).
    IF (SELECT count(*) FROM pg_catalog.pg_class c
        CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a WHERE a.grantee=reader.oid) <> 6
       OR (SELECT count(DISTINCT c.oid) FROM pg_catalog.pg_class c
           CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
           WHERE a.grantee=reader.oid AND c.relnamespace='public'::regnamespace AND c.relkind='r'
             AND c.relname=ANY(reader_tables) AND a.privilege_type='SELECT' AND NOT a.is_grantable) <> 6
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute c
           CROSS JOIN LATERAL pg_catalog.aclexplode(c.attacl) a WHERE a.grantee=reader.oid)
       OR (SELECT count(*) FROM pg_catalog.pg_namespace n
           CROSS JOIN LATERAL pg_catalog.aclexplode(n.nspacl) a WHERE a.grantee=reader.oid) <> 1
       OR (SELECT count(*) FROM pg_catalog.pg_namespace n
           CROSS JOIN LATERAL pg_catalog.aclexplode(n.nspacl) a WHERE a.grantee=reader.oid
             AND n.nspname='public' AND a.privilege_type='USAGE' AND NOT a.is_grantable) <> 1
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_database d
           CROSS JOIN LATERAL pg_catalog.aclexplode(d.datacl) a WHERE a.grantee=reader.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
           CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) a WHERE a.grantee=reader.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_type t
           CROSS JOIN LATERAL pg_catalog.aclexplode(t.typacl) a WHERE a.grantee=reader.oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl d
           CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a WHERE a.grantee=reader.oid) THEN
        RAISE EXCEPTION 'Reader ACL drift';
    END IF;
END
$guard$;

DROP POLICY aktau_api_reader_select ON public.stores;
DROP POLICY aktau_api_reader_select ON public.store_locations;
DROP POLICY aktau_api_reader_select ON public.categories;
DROP POLICY aktau_api_reader_select ON public.canonical_products;
DROP POLICY aktau_api_reader_select ON public.offers;
DROP POLICY aktau_api_reader_select ON public.snapshots;
REVOKE SELECT ON public.stores, public.store_locations, public.categories,
    public.canonical_products, public.offers, public.snapshots FROM aktau_api_reader;
REVOKE USAGE ON SCHEMA public FROM aktau_api_reader;
DROP ROLE aktau_api_reader;

COMMIT;
