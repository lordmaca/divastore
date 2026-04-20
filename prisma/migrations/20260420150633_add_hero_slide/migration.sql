-- CreateEnum
CREATE TYPE "HeroSlideSource" AS ENUM ('DIVAHUB_AUTO', 'MANUAL');

-- CreateTable
CREATE TABLE "HeroSlide" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "productId" TEXT,
    "imageUrl" TEXT NOT NULL,
    "imageAlt" TEXT,
    "headline" TEXT NOT NULL,
    "sub" TEXT,
    "ctaLabel" TEXT NOT NULL,
    "ctaUrl" TEXT NOT NULL,
    "headlineOverride" TEXT,
    "subOverride" TEXT,
    "ctaLabelOverride" TEXT,
    "ctaUrlOverride" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "activeFrom" TIMESTAMP(3),
    "activeUntil" TIMESTAMP(3),
    "source" "HeroSlideSource" NOT NULL DEFAULT 'DIVAHUB_AUTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeroSlide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HeroSlide_externalId_key" ON "HeroSlide"("externalId");

-- CreateIndex
CREATE INDEX "HeroSlide_enabled_idx" ON "HeroSlide"("enabled");

-- CreateIndex
CREATE INDEX "HeroSlide_productId_idx" ON "HeroSlide"("productId");

-- CreateIndex
CREATE INDEX "HeroSlide_source_idx" ON "HeroSlide"("source");

-- AddForeignKey
ALTER TABLE "HeroSlide" ADD CONSTRAINT "HeroSlide_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

