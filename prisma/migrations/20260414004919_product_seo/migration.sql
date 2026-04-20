-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "seoKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "seoTitle" TEXT,
ADD COLUMN     "shortName" TEXT;

