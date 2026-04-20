-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "shippingCarrier" TEXT,
ADD COLUMN     "shippingEtaDays" INTEGER,
ADD COLUMN     "shippingServiceId" TEXT;

-- AlterTable
ALTER TABLE "Variant" ADD COLUMN     "heightCm" INTEGER,
ADD COLUMN     "lengthCm" INTEGER,
ADD COLUMN     "widthCm" INTEGER;

