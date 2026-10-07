-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('IDEE', 'GEPRUEFT', 'TEST_DROP', 'ERGEBNIS');

-- CreateTable
CREATE TABLE "ProductCheck" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "purchasePrice" DECIMAL(10,2) NOT NULL,
    "purchaseCurrency" TEXT NOT NULL,
    "shippingCost" DECIMAL(10,2),
    "weightKg" DOUBLE PRECISION,
    "category" TEXT NOT NULL,
    "country" "Country" NOT NULL,
    "plannedPrice" DECIMAL(10,2),
    "stage" "PipelineStage" NOT NULL DEFAULT 'GEPRUEFT',
    "result" JSONB NOT NULL,
    "verdict" TEXT NOT NULL,
    "marginScore" DOUBLE PRECISION NOT NULL,
    "marginAbs" DECIMAL(10,2) NOT NULL,
    "marginPct" DOUBLE PRECISION NOT NULL,
    "trendKeyword" TEXT,
    "trendSeries" JSONB,
    "trendScore" DOUBLE PRECISION,
    "trendPhase" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductCheck_stage_idx" ON "ProductCheck"("stage");
