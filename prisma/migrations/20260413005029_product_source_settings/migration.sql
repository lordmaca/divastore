-- CreateEnum
CREATE TYPE "ProductSource" AS ENUM ('MANUAL', 'DIVAHUB');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "source" "ProductSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "SettingsKv" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "SettingsKv_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_externalId_key" ON "Product"("externalId");

-- CreateIndex
CREATE INDEX "Product_source_idx" ON "Product"("source");

