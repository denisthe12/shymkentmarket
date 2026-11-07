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
