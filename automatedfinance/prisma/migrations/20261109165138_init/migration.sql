-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "TokenKind" AS ENUM ('INVITE', 'RESET');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('PREVIEW', 'HELD', 'COMMITTED', 'ROLLED_BACK', 'DISCARDED');

-- CreateEnum
CREATE TYPE "BatchOrigin" AS ENUM ('UPLOAD', 'GOOGLE_SYNC', 'MANUAL', 'SEED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "passwordHash" TEXT,
    "totpSecretEnc" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mfaVerified" BOOLEAN NOT NULL DEFAULT false,
    "csrfToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "kind" "TokenKind" NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role",
    "userId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "pendingPasswordHash" TEXT,
    "pendingTotpEnc" TEXT,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "email" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "details" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "colorIndex" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "expenseType" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "colorIndex" INTEGER NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryMapping" (
    "id" SERIAL NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "category" TEXT NOT NULL,

    CONSTRAINT "CategoryMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "code" TEXT NOT NULL,
    "unitsPerUsd" DECIMAL(24,10),
    "note" TEXT,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Budget" (
    "department" TEXT NOT NULL,
    "monthlyAmount" DECIMAL(24,10) NOT NULL,
    "source" TEXT,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("department")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "growth" DECIMAL(12,8) NOT NULL,
    "growthOverBase" DECIMAL(12,8),
    "inflation" DECIMAL(12,8) NOT NULL,
    "fixAdjPct" DECIMAL(12,8) NOT NULL,
    "fixAdjAmt" DECIMAL(24,10) NOT NULL,
    "varAdjPct" DECIMAL(12,8) NOT NULL,
    "includePlanned" BOOLEAN NOT NULL DEFAULT true,
    "contingency" DECIMAL(12,8) NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SeasonalityIndex" (
    "month" INTEGER NOT NULL,
    "idx" DECIMAL(10,6) NOT NULL,

    CONSTRAINT "SeasonalityIndex_pkey" PRIMARY KEY ("month")
);

-- CreateTable
CREATE TABLE "PlannedExpense" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "department" TEXT NOT NULL,
    "amount" DECIMAL(24,10) NOT NULL,
    "inConservative" BOOLEAN NOT NULL DEFAULT false,
    "inBase" BOOLEAN NOT NULL DEFAULT false,
    "inHigh" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueLogItem" (
    "n" INTEGER NOT NULL,
    "sheetCell" TEXT NOT NULL,
    "issue" TEXT NOT NULL,
    "actionTaken" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolutionNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "IssueLogItem_pkey" PRIMARY KEY ("n")
);

-- CreateTable
CREATE TABLE "FlagResolution" (
    "flagKey" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "resolvedById" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlagResolution_pkey" PRIMARY KEY ("flagKey")
);

-- CreateTable
CREATE TABLE "ReconciliationCheck" (
    "id" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "measure" TEXT NOT NULL,
    "department" TEXT,
    "sourceRefs" JSONB NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "explanation" TEXT,
    "explainedDifference" DECIMAL(24,10),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ReconciliationCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringItemMeta" (
    "itemKey" TEXT NOT NULL,
    "department" TEXT,
    "snapshotMatch" TEXT,
    "frequency" TEXT,
    "note" TEXT,

    CONSTRAINT "RecurringItemMeta_pkey" PRIMARY KEY ("itemKey")
);

-- CreateTable
CREATE TABLE "GoogleSheetSource" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "year" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastMessage" TEXT,
    "lastBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleSheetSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceFile" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mime" TEXT,
    "bytes" BYTEA NOT NULL,
    "origin" "BatchOrigin" NOT NULL,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LayoutProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tabName" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LayoutProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "status" "BatchStatus" NOT NULL,
    "origin" "BatchOrigin" NOT NULL,
    "label" TEXT NOT NULL,
    "sourceFileId" TEXT,
    "googleSourceId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedById" TEXT,
    "committedAt" TIMESTAMP(3),
    "rolledBackById" TEXT,
    "rolledBackAt" TIMESTAMP(3),
    "heldReason" TEXT,
    "options" JSONB,
    "summary" JSONB,
    "plan" JSONB,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseVersion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "supersededById" TEXT,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "kind" TEXT NOT NULL,
    "profileId" TEXT,
    "lineKey" TEXT,
    "month" DATE,
    "txnDate" DATE,
    "department" TEXT,
    "sourceCategory" TEXT,
    "categoryOverride" TEXT,
    "item" TEXT,
    "description" TEXT,
    "vendor" TEXT,
    "vendorOverride" TEXT,
    "amount" DECIMAL(28,12),
    "currency" TEXT,
    "rawValue" TEXT,
    "recordType" TEXT NOT NULL,
    "countRole" TEXT NOT NULL DEFAULT 'ALWAYS',
    "countGroup" TEXT,
    "isTrigger" BOOLEAN NOT NULL DEFAULT false,
    "recurringOverride" TEXT,
    "paymentMethod" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "sourceFile" TEXT,
    "sheet" TEXT,
    "cell" TEXT,
    "rowNumber" INTEGER,
    "displayId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactVersion" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "supersededById" TEXT,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FactVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentStatus" (
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dueDate" DATE,
    "note" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentStatus_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "RecoveryCode_userId_idx" ON "RecoveryCode"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryMapping_sourceLabel_key" ON "CategoryMapping"("sourceLabel");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleSheetSource_sheetId_key" ON "GoogleSheetSource"("sheetId");

-- CreateIndex
CREATE INDEX "SourceFile_sha256_idx" ON "SourceFile"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "LayoutProfile_tabName_signature_key" ON "LayoutProfile"("tabName", "signature");

-- CreateIndex
CREATE INDEX "ImportBatch_status_idx" ON "ImportBatch"("status");

-- CreateIndex
CREATE INDEX "ExpenseVersion_key_idx" ON "ExpenseVersion"("key");

-- CreateIndex
CREATE INDEX "ExpenseVersion_batchId_idx" ON "ExpenseVersion"("batchId");

-- CreateIndex
CREATE INDEX "ExpenseVersion_supersededById_idx" ON "ExpenseVersion"("supersededById");

-- CreateIndex
CREATE INDEX "FactVersion_type_key_idx" ON "FactVersion"("type", "key");

-- CreateIndex
CREATE INDEX "FactVersion_batchId_idx" ON "FactVersion"("batchId");

-- CreateIndex
CREATE INDEX "FactVersion_supersededById_idx" ON "FactVersion"("supersededById");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCode" ADD CONSTRAINT "RecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "SourceFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseVersion" ADD CONSTRAINT "ExpenseVersion_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactVersion" ADD CONSTRAINT "FactVersion_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
