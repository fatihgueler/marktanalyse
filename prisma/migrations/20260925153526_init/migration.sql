-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "Country" AS ENUM ('DE', 'AT', 'CH', 'GB');

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "sourceModes" JSONB NOT NULL,
    "configVersion" TEXT NOT NULL,
    "errors" JSONB,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandSignal" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "country" "Country" NOT NULL,
    "keyword" TEXT NOT NULL,
    "seedTerm" TEXT,
    "series" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "DemandSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyProduct" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "imageUrl" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyOffer" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "shipTo" "Country" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "shippingCost" DECIMAL(10,2),
    "orders30d" INTEGER,
    "rating" DOUBLE PRECISION,
    "resultCount" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "SupplyOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferencePrice" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "country" "Country" NOT NULL,
    "keyword" TEXT NOT NULL,
    "medianPrice" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "ReferencePrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchJudgment" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "judge" TEXT NOT NULL,
    "relevance" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchJudgment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateSnapshot" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "demandSignalId" TEXT NOT NULL,
    "supplyOfferId" TEXT NOT NULL,
    "country" "Country" NOT NULL,
    "keyword" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "relevance" DOUBLE PRECISION NOT NULL,
    "matchReason" TEXT NOT NULL,
    "matchJudge" TEXT NOT NULL,
    "trendScore" DOUBLE PRECISION NOT NULL,
    "marginScore" DOUBLE PRECISION NOT NULL,
    "competitionScore" DOUBLE PRECISION NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "landedCost" DECIMAL(10,2) NOT NULL,
    "referencePrice" DECIMAL(10,2) NOT NULL,
    "referencePriceSource" TEXT NOT NULL,
    "marginAbs" DECIMAL(10,2) NOT NULL,
    "marginPct" DOUBLE PRECISION NOT NULL,
    "belowMinMargin" BOOLEAN NOT NULL,
    "currency" TEXT NOT NULL,
    "breakdown" JSONB NOT NULL,

    CONSTRAINT "CandidateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Run_startedAt_idx" ON "Run"("startedAt");

-- CreateIndex
CREATE INDEX "DemandSignal_keyword_country_idx" ON "DemandSignal"("keyword", "country");

-- CreateIndex
CREATE UNIQUE INDEX "DemandSignal_runId_source_country_keyword_key" ON "DemandSignal"("runId", "source", "country", "keyword");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyProduct_source_externalId_key" ON "SupplyProduct"("source", "externalId");

-- CreateIndex
CREATE INDEX "SupplyOffer_keyword_idx" ON "SupplyOffer"("keyword");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyOffer_runId_productId_keyword_shipTo_key" ON "SupplyOffer"("runId", "productId", "keyword", "shipTo");

-- CreateIndex
CREATE UNIQUE INDEX "ReferencePrice_runId_source_country_keyword_key" ON "ReferencePrice"("runId", "source", "country", "keyword");

-- CreateIndex
CREATE UNIQUE INDEX "MatchJudgment_keyword_productId_judge_key" ON "MatchJudgment"("keyword", "productId", "judge");

-- CreateIndex
CREATE INDEX "CandidateSnapshot_runId_totalScore_idx" ON "CandidateSnapshot"("runId", "totalScore");

-- CreateIndex
CREATE INDEX "CandidateSnapshot_productId_country_idx" ON "CandidateSnapshot"("productId", "country");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateSnapshot_runId_productId_country_keyword_key" ON "CandidateSnapshot"("runId", "productId", "country", "keyword");

-- AddForeignKey
ALTER TABLE "DemandSignal" ADD CONSTRAINT "DemandSignal_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOffer" ADD CONSTRAINT "SupplyOffer_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOffer" ADD CONSTRAINT "SupplyOffer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SupplyProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferencePrice" ADD CONSTRAINT "ReferencePrice_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchJudgment" ADD CONSTRAINT "MatchJudgment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SupplyProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSnapshot" ADD CONSTRAINT "CandidateSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSnapshot" ADD CONSTRAINT "CandidateSnapshot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SupplyProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSnapshot" ADD CONSTRAINT "CandidateSnapshot_demandSignalId_fkey" FOREIGN KEY ("demandSignalId") REFERENCES "DemandSignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSnapshot" ADD CONSTRAINT "CandidateSnapshot_supplyOfferId_fkey" FOREIGN KEY ("supplyOfferId") REFERENCES "SupplyOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
