-- CreateEnum
CREATE TYPE "OrderEventType" AS ENUM ('ORDER_CREATED', 'PAYMENT_PENDING', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED', 'PAYMENT_REFUNDED', 'PAYMENT_CHARGED_BACK', 'INVOICE_REQUESTED', 'INVOICE_ISSUED', 'INVOICE_FAILED', 'INVOICE_CANCELLED', 'LABEL_PURCHASED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERY_EXCEPTION', 'DELIVERED', 'CANCELLED', 'NOTE_ADDED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "lastPaymentMethod" "PaymentMethod",
ADD COLUMN     "lastPaymentStatus" "PaymentStatus";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "boletoBarcode" TEXT,
ADD COLUMN     "boletoExpiresAt" TIMESTAMP(3),
ADD COLUMN     "boletoUrl" TEXT,
ADD COLUMN     "cardHolderName" TEXT,
ADD COLUMN     "cardLastFour" TEXT,
ADD COLUMN     "feeCents" INTEGER,
ADD COLUMN     "installmentAmountCents" INTEGER,
ADD COLUMN     "installments" INTEGER,
ADD COLUMN     "netReceivedCents" INTEGER,
ADD COLUMN     "paymentTypeId" TEXT,
ADD COLUMN     "pixExpiresAt" TIMESTAMP(3),
ADD COLUMN     "pixQrCode" TEXT,
ADD COLUMN     "pixQrCodeBase64" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "refundedCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "OrderEventType" NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'system',
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderEvent_type_createdAt_idx" ON "OrderEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_lastPaymentMethod_idx" ON "Order"("lastPaymentMethod");

-- CreateIndex
CREATE INDEX "Order_lastPaymentStatus_idx" ON "Order"("lastPaymentStatus");

-- CreateIndex
CREATE INDEX "Payment_paymentTypeId_idx" ON "Payment"("paymentTypeId");

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

