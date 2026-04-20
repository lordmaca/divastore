-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('QUOTED', 'PURCHASED', 'PRINTED', 'POSTED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION', 'RETURNED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'melhorenvio',
    "providerShipmentId" TEXT,
    "serviceId" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PURCHASED',
    "trackingCode" TEXT,
    "trackingUrl" TEXT,
    "labelUrl" TEXT,
    "lastError" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "printedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_providerShipmentId_key" ON "Shipment"("providerShipmentId");

-- CreateIndex
CREATE INDEX "Shipment_orderId_idx" ON "Shipment"("orderId");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE INDEX "Shipment_trackingCode_idx" ON "Shipment"("trackingCode");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

