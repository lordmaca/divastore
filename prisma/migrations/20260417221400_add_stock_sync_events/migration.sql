-- CreateEnum
CREATE TYPE "StockSyncSource" AS ENUM ('TINY_CRON', 'TINY_WEBHOOK', 'ADMIN_MANUAL', 'CLI');

-- CreateTable
CREATE TABLE "StockSyncEvent" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "variantId" TEXT,
    "oldStock" INTEGER NOT NULL,
    "newStock" INTEGER NOT NULL,
    "source" "StockSyncSource" NOT NULL,
    "integrationRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockSyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockSyncEvent_sku_createdAt_idx" ON "StockSyncEvent"("sku", "createdAt");

-- CreateIndex
CREATE INDEX "StockSyncEvent_createdAt_idx" ON "StockSyncEvent"("createdAt");

-- CreateIndex
CREATE INDEX "StockSyncEvent_integrationRunId_idx" ON "StockSyncEvent"("integrationRunId");

