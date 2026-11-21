-- Shymkent baseline; replaces the inherited migration chain.
-- Schema = the final schema of that chain, except: store code is open text with a format CHECK
-- (no "StoreCode" enum), stores."sortOrder" orders stores on the dashboard, offer_price_basis knows
-- only MAGNUM. No category rows (the taxonomy migration adds them) and no store locations.
-- Provision/verify aktau_api_reader first (backend/prisma/security/aktau_api_reader_role.sql).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- CreateEnum
CREATE TYPE "MatchMethod" AS ENUM ('barcode', 'deterministic', 'ai', 'manual');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('approved', 'pending', 'rejected');

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stores_code_check" CHECK ("code" ~ '^[A-Z][A-Z0-9_]{1,31}$')
);

-- CreateTable
CREATE TABLE "store_locations" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "store_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filterSchema" JSONB,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_products" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "rawName" TEXT NOT NULL,
    "rawBrand" TEXT,
    "rawCategory" TEXT,
    "rawPrice" INTEGER NOT NULL,
    "rawOldPrice" INTEGER,
    "rawImageUrl" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canonical_products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "categoryId" TEXT NOT NULL,
    "imageUrl" TEXT,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canonical_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_mappings" (
    "id" TEXT NOT NULL,
    "rawProductId" TEXT NOT NULL,
    "canonicalProductId" TEXT NOT NULL,
    "matchMethod" "MatchMethod" NOT NULL,
    "matchConfidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'approved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "canonicalProductId" TEXT NOT NULL,
    "rawProductId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "oldPrice" INTEGER,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stores_code_key" ON "stores"("code");

-- CreateIndex
CREATE INDEX "store_locations_storeId_idx" ON "store_locations"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "raw_products_storeId_idx" ON "raw_products"("storeId");

-- CreateIndex
CREATE INDEX "raw_products_rawCategory_idx" ON "raw_products"("rawCategory");

-- CreateIndex
CREATE UNIQUE INDEX "raw_products_storeId_sourceProductId_key" ON "raw_products"("storeId", "sourceProductId");

-- CreateIndex
CREATE INDEX "canonical_products_categoryId_idx" ON "canonical_products"("categoryId");

-- CreateIndex
CREATE INDEX "canonical_products_brand_idx" ON "canonical_products"("brand");

-- CreateIndex
CREATE INDEX "product_mappings_rawProductId_idx" ON "product_mappings"("rawProductId");

-- CreateIndex
CREATE INDEX "product_mappings_canonicalProductId_idx" ON "product_mappings"("canonicalProductId");

-- CreateIndex
CREATE INDEX "offers_canonicalProductId_idx" ON "offers"("canonicalProductId");

-- CreateIndex
CREATE INDEX "offers_storeId_idx" ON "offers"("storeId");

-- CreateIndex
CREATE INDEX "offers_price_idx" ON "offers"("price");

-- CreateIndex
CREATE INDEX "offers_snapshotAt_idx" ON "offers"("snapshotAt");

-- AddForeignKey
ALTER TABLE "store_locations" ADD CONSTRAINT "store_locations_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_products" ADD CONSTRAINT "raw_products_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_products" ADD CONSTRAINT "canonical_products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_mappings" ADD CONSTRAINT "product_mappings_rawProductId_fkey" FOREIGN KEY ("rawProductId") REFERENCES "raw_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_mappings" ADD CONSTRAINT "product_mappings_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "canonical_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "canonical_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_rawProductId_fkey" FOREIGN KEY ("rawProductId") REFERENCES "raw_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Runtime read access (RLS and grants for aktau_api_reader).
DO $guard$
DECLARE
    reader_oid oid;
    app_tables text[] := ARRAY['stores','store_locations','categories','raw_products',
        'canonical_products','product_mappings','offers'];
    rls_enabled integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = 'aktau_api_reader' AND NOT rolcanlogin AND NOT rolsuper
          AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication
          AND NOT rolbypassrls AND rolinherit
    ) THEN
        RAISE EXCEPTION 'Provision/verify the restricted aktau_api_reader group first';
    END IF;
    SELECT oid INTO reader_oid FROM pg_catalog.pg_roles WHERE rolname = 'aktau_api_reader';
    -- Independently enforce the same pre-activation operator anchor as bootstrap.
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member = reader_oid)
       OR NOT (
           ((SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user)
            AND (SELECT count(*) FROM pg_catalog.pg_auth_members WHERE roleid = reader_oid) = 0)
           OR
           ((SELECT NOT rolsuper AND rolcreaterole FROM pg_catalog.pg_roles WHERE rolname = current_user)
            AND (SELECT count(*) FROM pg_catalog.pg_auth_members WHERE roleid = reader_oid) = 1
            AND EXISTS (
                SELECT 1 FROM pg_catalog.pg_auth_members m
                JOIN pg_catalog.pg_roles grantor ON grantor.oid = m.grantor
                WHERE m.roleid = reader_oid
                  AND m.member = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
                  AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
                  AND grantor.rolsuper))
       ) THEN
        RAISE EXCEPTION 'Reader must have only the exact current-operator admin anchor or no members for a superuser';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relowner = reader_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspowner = reader_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datdba = reader_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE proowner = reader_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_type WHERE typowner = reader_oid) THEN
        RAISE EXCEPTION 'aktau_api_reader must have no owned objects';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_database d
            CROSS JOIN LATERAL pg_catalog.aclexplode(d.datacl) a
            WHERE reader_oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n
            CROSS JOIN LATERAL pg_catalog.aclexplode(n.nspacl) a
            WHERE reader_oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c
            CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
            WHERE reader_oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute c
            CROSS JOIN LATERAL pg_catalog.aclexplode(c.attacl) a
            WHERE reader_oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
            CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) a
            WHERE reader_oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_type t
            CROSS JOIN LATERAL pg_catalog.aclexplode(t.typacl) a
            WHERE reader_oid IN (a.grantee,a.grantor))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl d WHERE d.defaclrole = reader_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl d
            CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a
            WHERE reader_oid IN (a.grantee,a.grantor)) THEN
        RAISE EXCEPTION 'aktau_api_reader must have no pre-existing direct or default privileges';
    END IF;
    IF (SELECT count(*) FROM pg_catalog.pg_class WHERE relnamespace='public'::regnamespace
        AND relname=ANY(app_tables) AND relkind='r') <> 7 THEN
        RAISE EXCEPTION 'Expected exactly seven ordinary application tables';
    END IF;
    -- Lock all target tables before inspecting RLS/policies: concurrent ALTER or
    -- POLICY DDL cannot slip between this baseline guard and the forward steps.
    LOCK TABLE public.stores, public.store_locations, public.categories,
        public.raw_products, public.canonical_products, public.product_mappings,
        public.offers IN ACCESS EXCLUSIVE MODE;
    SELECT count(*) INTO rls_enabled FROM pg_catalog.pg_class
        WHERE relnamespace='public'::regnamespace AND relname=ANY(app_tables) AND relrowsecurity;
    IF rls_enabled NOT IN (0,7)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace='public'::regnamespace
            AND relname=ANY(app_tables) AND relforcerowsecurity)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
            WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY(app_tables)) THEN
        RAISE EXCEPTION 'Unexpected application RLS or policy baseline';
    END IF;
END
$guard$;

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO aktau_api_reader;
GRANT SELECT ON public.stores, public.store_locations, public.categories,
    public.canonical_products, public.offers TO aktau_api_reader;

CREATE POLICY aktau_api_reader_select ON public.stores
    FOR SELECT TO aktau_api_reader USING (true);
CREATE POLICY aktau_api_reader_select ON public.store_locations
    FOR SELECT TO aktau_api_reader USING (true);
CREATE POLICY aktau_api_reader_select ON public.categories
    FOR SELECT TO aktau_api_reader USING (true);
CREATE POLICY aktau_api_reader_select ON public.canonical_products
    FOR SELECT TO aktau_api_reader USING (true);
CREATE POLICY aktau_api_reader_select ON public.offers
    FOR SELECT TO aktau_api_reader USING (true);

-- Snapshot history.
LOCK TABLE public.raw_products, public.offers IN ACCESS EXCLUSIVE MODE;

CREATE TYPE "SnapshotStatus" AS ENUM ('building','validating','published','failed');
CREATE TYPE "SourceRunStatus" AS ENUM ('pending','succeeded','failed');
CREATE TABLE public.snapshots (
    id TEXT PRIMARY KEY,
    status "SnapshotStatus" NOT NULL DEFAULT 'building',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "sourceStats" JSONB NOT NULL DEFAULT '{}',
    "qualityReport" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT snapshots_publication_check CHECK ((status='published') = ("publishedAt" IS NOT NULL))
);
CREATE TABLE public.source_runs (
    id TEXT PRIMARY KEY,
    "snapshotId" TEXT NOT NULL REFERENCES public.snapshots(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    "storeId" TEXT NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    status "SourceRunStatus" NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3),
    "productCount" INTEGER NOT NULL DEFAULT 0 CHECK ("productCount">=0),
    "errorCount" INTEGER NOT NULL DEFAULT 0 CHECK ("errorCount">=0),
    "errorSummary" TEXT,
    "sourceStats" JSONB NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX "source_runs_snapshotId_storeId_key" ON public.source_runs("snapshotId","storeId");
CREATE INDEX "source_runs_storeId_status_capturedAt_idx" ON public.source_runs("storeId",status,"capturedAt");
CREATE INDEX "snapshots_status_publishedAt_idx" ON public.snapshots(status,"publishedAt");
CREATE INDEX "snapshots_publishedAt_idx" ON public.snapshots("publishedAt");

ALTER TABLE public.raw_products ADD COLUMN "snapshotId" TEXT;
ALTER TABLE public.offers ADD COLUMN "snapshotId" TEXT;
ALTER TABLE public.raw_products ALTER COLUMN "snapshotId" SET NOT NULL;
ALTER TABLE public.offers ALTER COLUMN "snapshotId" SET NOT NULL;
DROP INDEX public."raw_products_storeId_sourceProductId_key";
CREATE UNIQUE INDEX "raw_products_snapshotId_storeId_sourceProductId_key" ON public.raw_products("snapshotId","storeId","sourceProductId");
CREATE UNIQUE INDEX "raw_products_id_snapshotId_key" ON public.raw_products(id,"snapshotId");
ALTER TABLE public.raw_products ADD CONSTRAINT "raw_products_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES public.snapshots(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public.offers ADD CONSTRAINT "offers_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES public.snapshots(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public.offers DROP CONSTRAINT "offers_rawProductId_fkey";
ALTER TABLE public.offers ADD CONSTRAINT "offers_rawProductId_snapshotId_fkey" FOREIGN KEY ("rawProductId","snapshotId") REFERENCES public.raw_products(id,"snapshotId") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "offers_snapshotId_idx" ON public.offers("snapshotId");
CREATE INDEX "offers_snapshotId_canonicalProductId_idx" ON public.offers("snapshotId","canonicalProductId");
CREATE INDEX "offers_snapshotId_storeId_idx" ON public.offers("snapshotId","storeId");
ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.snapshots,public.source_runs FROM PUBLIC;
GRANT SELECT ON public.snapshots TO aktau_api_reader;
CREATE POLICY aktau_api_reader_select ON public.snapshots FOR SELECT TO aktau_api_reader USING (true);

-- Monthly price history.
-- CreateTable
CREATE TABLE "price_history" (
    "month" DATE NOT NULL,
    "storeId" TEXT NOT NULL,
    "canonicalProductId" TEXT NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "oldPrice" INTEGER,
    "reviewStatus" "ReviewStatus" NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("month","storeId","canonicalProductId")
);

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "canonical_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.price_history FROM PUBLIC;
DO $revoke$ BEGIN
  IF to_regrole('anon') IS NOT NULL THEN REVOKE ALL ON public.price_history FROM anon; END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN REVOKE ALL ON public.price_history FROM authenticated; END IF;
END $revoke$;

-- Product identity registry.
-- CreateTable
CREATE TABLE "product_identities" (
    "storeId" TEXT NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "canonicalProductId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_identities_pkey" PRIMARY KEY ("storeId","sourceProductId")
);

-- AddForeignKey
ALTER TABLE "product_identities" ADD CONSTRAINT "product_identities_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_identities" ADD CONSTRAINT "product_identities_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "canonical_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE public.product_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_identities FROM PUBLIC;
DO $revoke$ BEGIN
  IF to_regrole('anon') IS NOT NULL THEN REVOKE ALL ON public.product_identities FROM anon; END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN REVOKE ALL ON public.product_identities FROM authenticated; END IF;
END $revoke$;

-- Price basis per offer: sold by weight (price per kg) or per piece.
-- The view runs with the owner's rights, so the API reader sees four columns and never raw_products.
-- snapshotId lets callers filter by snapshot; PostgreSQL pushes that filter into offers and raw_products.

DO $guard$
DECLARE
    raw_owner oid;
    raw_forced boolean;
BEGIN
    SELECT relowner, relforcerowsecurity INTO raw_owner, raw_forced
    FROM pg_catalog.pg_class WHERE oid = 'public.raw_products'::regclass;
    IF raw_forced THEN
        RAISE EXCEPTION 'raw_products has FORCE ROW LEVEL SECURITY: offer_price_basis would return no rows';
    END IF;
    -- The view owner is the migration role; it must read raw_products past RLS.
    IF NOT pg_catalog.pg_has_role(current_user, raw_owner, 'USAGE')
       AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
                       WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
        RAISE EXCEPTION 'Migration role must own raw_products or bypass RLS: offer_price_basis would return no rows';
    END IF;
END
$guard$;

-- Rule = pipeline/src/mapping/weight.ts isVariableWeight; change both together.
-- Magnum: weighted items carry rawPayload.isWeighted = true and a price per 1 kg.
CREATE VIEW public.offer_price_basis AS
SELECT o.id AS "offerId",
       w.weighted AS "soldByWeight",
       CASE WHEN w.weighted THEN 1000::numeric END AS "basisGrams",
       o."snapshotId" AS "snapshotId"
FROM public.offers o
JOIN public.raw_products r ON r.id = o."rawProductId" AND r."snapshotId" = o."snapshotId"
JOIN public.stores s ON s.id = o."storeId"
CROSS JOIN LATERAL (SELECT CASE s.code
  WHEN 'MAGNUM' THEN coalesce(r."rawPayload"->>'isWeighted' = 'true', false)
  ELSE false END AS weighted) w;

REVOKE ALL ON public.offer_price_basis FROM PUBLIC;
DO $revoke$ BEGIN
  IF to_regrole('anon') IS NOT NULL THEN REVOKE ALL ON public.offer_price_basis FROM anon; END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN REVOKE ALL ON public.offer_price_basis FROM authenticated; END IF;
END $revoke$;
DO $grant$ BEGIN
  IF to_regrole('aktau_api_reader') IS NOT NULL THEN GRANT SELECT ON public.offer_price_basis TO aktau_api_reader; END IF;
END $grant$;

-- The only store at launch. No store_locations: real addresses are separate approved work.
INSERT INTO public.stores (id, code, name, "logoUrl", "sortOrder")
VALUES ('9bddfe39-c858-44d9-9518-5cfe66ec429c', 'MAGNUM', 'Magnum', NULL, 10);

COMMIT;
