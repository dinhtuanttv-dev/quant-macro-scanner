-- CreateTable
CREATE TABLE "MacroNews" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT,
    "impactScore" INTEGER NOT NULL DEFAULT 0,
    "sector" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MacroNews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MacroNews_createdAt_idx" ON "MacroNews"("createdAt");
