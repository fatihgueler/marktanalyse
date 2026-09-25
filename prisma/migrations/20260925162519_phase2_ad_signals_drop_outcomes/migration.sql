-- CreateEnum
CREATE TYPE "DropVerdict" AS ENUM ('TOP', 'OK', 'FLOP');

-- CreateTable
CREATE TABLE "AdSignal" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "country" "Country" NOT NULL,
    "keyword" TEXT NOT NULL,
    "coverage" BOOLEAN NOT NULL,
    "activeAds" INTEGER NOT NULL,
    "advertisers" INTEGER NOT NULL,
    "capped" BOOLEAN NOT NULL,
    "newAdsPerWeek" JSONB NOT NULL,
    "firstSeen" TEXT,
    "samples" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "AdSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DropOutcome" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "candidateSnapshotId" TEXT,
    "country" "Country" NOT NULL,
    "keyword" TEXT NOT NULL,
    "droppedAt" TIMESTAMP(3) NOT NULL,
    "unitsSold" INTEGER,
    "returnRate" DOUBLE PRECISION,
    "verdict" "DropVerdict" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DropOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdSignal_keyword_country_idx" ON "AdSignal"("keyword", "country");

-- CreateIndex
CREATE UNIQUE INDEX "AdSignal_runId_source_country_keyword_key" ON "AdSignal"("runId", "source", "country", "keyword");

-- CreateIndex
CREATE INDEX "DropOutcome_productId_country_idx" ON "DropOutcome"("productId", "country");

-- AddForeignKey
ALTER TABLE "AdSignal" ADD CONSTRAINT "AdSignal_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropOutcome" ADD CONSTRAINT "DropOutcome_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SupplyProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropOutcome" ADD CONSTRAINT "DropOutcome_candidateSnapshotId_fkey" FOREIGN KEY ("candidateSnapshotId") REFERENCES "CandidateSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
