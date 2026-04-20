-- CreateEnum
CREATE TYPE "CategoryIssueStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED', 'AUTO_APPLIED');

-- CreateTable
CREATE TABLE "CategoryAuditIssue" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "currentCategoryId" TEXT,
    "suggestedCategoryId" TEXT,
    "confidence" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "status" "CategoryIssueStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "dismissalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryAuditIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryAuditIssue_productId_key" ON "CategoryAuditIssue"("productId");

-- CreateIndex
CREATE INDEX "CategoryAuditIssue_status_createdAt_idx" ON "CategoryAuditIssue"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CategoryAuditIssue_confidence_status_idx" ON "CategoryAuditIssue"("confidence", "status");

-- AddForeignKey
ALTER TABLE "CategoryAuditIssue" ADD CONSTRAINT "CategoryAuditIssue_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

