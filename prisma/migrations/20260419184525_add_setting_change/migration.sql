-- CreateTable
CREATE TABLE "SettingChange" (
    "id" TEXT NOT NULL,
    "settingKey" TEXT NOT NULL,
    "fieldPath" TEXT,
    "changedBy" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "diff" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettingChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SettingChange_settingKey_createdAt_idx" ON "SettingChange"("settingKey", "createdAt");

-- CreateIndex
CREATE INDEX "SettingChange_changedBy_createdAt_idx" ON "SettingChange"("changedBy", "createdAt");

