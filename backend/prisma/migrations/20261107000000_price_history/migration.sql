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
