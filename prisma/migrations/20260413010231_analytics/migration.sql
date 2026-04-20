-- CreateEnum
CREATE TYPE "FunnelEventType" AS ENUM ('VIEW_PDP', 'ADD_TO_CART', 'BEGIN_CHECKOUT', 'ORDER_CREATED', 'ORDER_PAID');

-- CreateTable
CREATE TABLE "PageView" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "productId" TEXT,
    "sessionId" TEXT NOT NULL,
    "customerId" TEXT,
    "referer" TEXT,
    "device" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunnelEvent" (
    "id" TEXT NOT NULL,
    "type" "FunnelEventType" NOT NULL,
    "sessionId" TEXT NOT NULL,
    "customerId" TEXT,
    "productId" TEXT,
    "orderId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FunnelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMetricDaily" (
    "productId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "addsToCart" INTEGER NOT NULL DEFAULT 0,
    "ordersPaid" INTEGER NOT NULL DEFAULT 0,
    "revenueCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductMetricDaily_pkey" PRIMARY KEY ("productId","day")
);

-- CreateIndex
CREATE INDEX "PageView_createdAt_idx" ON "PageView"("createdAt");

-- CreateIndex
CREATE INDEX "PageView_productId_createdAt_idx" ON "PageView"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "PageView_sessionId_createdAt_idx" ON "PageView"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "FunnelEvent_type_createdAt_idx" ON "FunnelEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "FunnelEvent_sessionId_idx" ON "FunnelEvent"("sessionId");

-- CreateIndex
CREATE INDEX "FunnelEvent_productId_type_createdAt_idx" ON "FunnelEvent"("productId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "ProductMetricDaily_day_idx" ON "ProductMetricDaily"("day");

