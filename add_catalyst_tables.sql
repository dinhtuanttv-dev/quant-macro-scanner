-- CreateEnum
CREATE TYPE "CatalystCategory" AS ENUM ('earnings', 'ma', 'regulatory', 'rating', 'contract', 'insider', 'macro');

-- CreateEnum
CREATE TYPE "CatalystCredibility" AS ENUM ('confirmed', 'rumor');

-- CreateEnum
CREATE TYPE "PropagationDistance" AS ENUM ('direct', 'upstream', 'downstream', 'competitor', 'commodity');

-- CreateEnum
CREATE TYPE "ImpactDirection" AS ENUM ('benefit', 'harm');

-- CreateEnum
CREATE TYPE "TargetType" AS ENUM ('sector', 'ticker');

-- CreateEnum
CREATE TYPE "Horizon" AS ENUM ('short', 'medium', 'long');

-- CreateTable
CREATE TABLE "CatalystSource" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "CatalystCategory" NOT NULL,
    "sourceCredibility" "CatalystCredibility" NOT NULL,
    "publishedDate" TIMESTAMP(3) NOT NULL,
    "executionDate" TIMESTAMP(3),
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "corroborationCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalystSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpactEdge" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetType" "TargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "direction" "ImpactDirection" NOT NULL,
    "propagationDistance" "PropagationDistance" NOT NULL,
    "hopCount" INTEGER NOT NULL DEFAULT 1,
    "baseWeight" DOUBLE PRECISION NOT NULL,
    "decayRate" DOUBLE PRECISION NOT NULL,
    "horizon" "Horizon" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImpactEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalystSource_firstDetectedAt_idx" ON "CatalystSource"("firstDetectedAt");

-- CreateIndex
CREATE INDEX "CatalystSource_category_idx" ON "CatalystSource"("category");

-- CreateIndex
CREATE INDEX "ImpactEdge_targetType_targetId_idx" ON "ImpactEdge"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "ImpactEdge_sourceId_idx" ON "ImpactEdge"("sourceId");

-- AddForeignKey
ALTER TABLE "ImpactEdge" ADD CONSTRAINT "ImpactEdge_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CatalystSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
