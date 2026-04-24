-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARN',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronHeartbeat" (
    "name" TEXT NOT NULL,
    "schedule" TEXT,
    "lastStartAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStatus" TEXT NOT NULL,
    "lastError" TEXT,
    "durationMs" INTEGER,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CronHeartbeat_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE UNIQUE INDEX "Alert_signature_key" ON "Alert"("signature");

-- CreateIndex
CREATE INDEX "Alert_resolvedAt_lastSeenAt_idx" ON "Alert"("resolvedAt", "lastSeenAt" DESC);

-- CreateIndex
CREATE INDEX "Alert_category_lastSeenAt_idx" ON "Alert"("category", "lastSeenAt" DESC);

