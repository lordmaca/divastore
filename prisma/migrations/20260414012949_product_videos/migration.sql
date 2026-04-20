-- CreateEnum
CREATE TYPE "VideoSource" AS ENUM ('YOUTUBE', 'TIKTOK', 'INSTAGRAM', 'OCI');

-- CreateEnum
CREATE TYPE "VideoKind" AS ENUM ('REEL', 'STORY');

-- CreateTable
CREATE TABLE "ProductVideo" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" "VideoSource" NOT NULL,
    "kind" "VideoKind" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductVideo_productId_position_idx" ON "ProductVideo"("productId", "position");

-- AddForeignKey
ALTER TABLE "ProductVideo" ADD CONSTRAINT "ProductVideo_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

