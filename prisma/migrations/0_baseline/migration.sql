-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."MacroNewsRecord" (
    "id" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "summary" TEXT,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "rawImpact" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL,
    "affectedSectors" TEXT[],
    "relatedTickers" TEXT[],
    "contentHash" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MacroNewsRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MacroNewsRecord_contentHash_key" ON "public"."MacroNewsRecord"("contentHash" ASC);

-- CreateIndex
CREATE INDEX "MacroNewsRecord_publishedAt_idx" ON "public"."MacroNewsRecord"("publishedAt" ASC);

-- CreateIndex
CREATE INDEX "MacroNewsRecord_scope_idx" ON "public"."MacroNewsRecord"("scope" ASC);

-- CreateIndex
CREATE INDEX "MacroNewsRecord_severity_idx" ON "public"."MacroNewsRecord"("severity" ASC);

-- CreateIndex
CREATE INDEX "MacroNewsRecord_sourceId_idx" ON "public"."MacroNewsRecord"("sourceId" ASC);
