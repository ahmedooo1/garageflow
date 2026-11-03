-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('DISCOVERED', 'QUALIFIED', 'READY_FOR_REVIEW', 'CONTACTED', 'REPLIED', 'DEMO_BOOKED', 'TRIAL', 'CONVERTED', 'NOT_INTERESTED', 'DO_NOT_CONTACT');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('SIRENE', 'CSV_IMPORT', 'MANUAL', 'INBOUND_DEMO');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "DraftKind" AS ENUM ('FIRST_CONTACT', 'DEMO_INVITE', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENT', 'DISCARDED');

-- CreateEnum
CREATE TYPE "SuppressionKind" AS ENUM ('EMAIL', 'DOMAIN', 'SIRET');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "Garage" ADD COLUMN     "acquisitionSource" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "siret" TEXT,
    "siren" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "zone" TEXT NOT NULL DEFAULT '',
    "nafCode" TEXT NOT NULL DEFAULT '',
    "companyCreatedOn" TIMESTAMP(3),
    "workforceRange" TEXT NOT NULL DEFAULT '',
    "establishmentsCount" INTEGER,
    "dedupeKey" TEXT NOT NULL,
    "website" TEXT NOT NULL DEFAULT '',
    "websiteSignals" JSONB,
    "websiteCheckedAt" TIMESTAMP(3),
    "email" TEXT NOT NULL DEFAULT '',
    "emailSourceUrl" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "phoneSourceUrl" TEXT NOT NULL DEFAULT '',
    "contactName" TEXT NOT NULL DEFAULT '',
    "source" "LeadSource" NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceFetchedAt" TIMESTAMP(3) NOT NULL,
    "stage" "LeadStage" NOT NULL DEFAULT 'DISCOVERED',
    "score" INTEGER NOT NULL DEFAULT 0,
    "confidence" "Confidence" NOT NULL DEFAULT 'LOW',
    "scoreEvidence" JSONB,
    "hypothesis" TEXT NOT NULL DEFAULT '',
    "scoredAt" TIMESTAMP(3),
    "demoRequestedAt" TIMESTAMP(3),
    "demoMessage" TEXT NOT NULL DEFAULT '',
    "lastContactedAt" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "objection" TEXT NOT NULL DEFAULT '',
    "optedOutAt" TIMESTAMP(3),
    "garageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachDraft" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "kind" "DraftKind" NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'DRAFT',
    "toEmail" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "generator" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentById" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentVia" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuppressionEntry" (
    "id" TEXT NOT NULL,
    "kind" "SuppressionKind" NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "origin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuppressionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthJobRun" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "status" "JobStatus" NOT NULL DEFAULT 'RUNNING',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "trigger" TEXT NOT NULL DEFAULT '',
    "stats" JSONB,
    "error" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "GrowthJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "leadId" TEXT,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiMonthlyBudgetUsd" INTEGER NOT NULL DEFAULT 10,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageView" (
    "day" DATE NOT NULL,
    "path" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("day","path","source")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_siret_key" ON "Lead"("siret");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_dedupeKey_key" ON "Lead"("dedupeKey");

-- CreateIndex
CREATE INDEX "Lead_stage_idx" ON "Lead"("stage");

-- CreateIndex
CREATE INDEX "Lead_zone_idx" ON "Lead"("zone");

-- CreateIndex
CREATE INDEX "Lead_score_idx" ON "Lead"("score");

-- CreateIndex
CREATE INDEX "Lead_email_idx" ON "Lead"("email");

-- CreateIndex
CREATE INDEX "Lead_nextFollowUpAt_idx" ON "Lead"("nextFollowUpAt");

-- CreateIndex
CREATE INDEX "Lead_garageId_idx" ON "Lead"("garageId");

-- CreateIndex
CREATE INDEX "LeadActivity_leadId_createdAt_idx" ON "LeadActivity"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "OutreachDraft_leadId_idx" ON "OutreachDraft"("leadId");

-- CreateIndex
CREATE INDEX "OutreachDraft_status_sentAt_idx" ON "OutreachDraft"("status", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "SuppressionEntry_kind_value_key" ON "SuppressionEntry"("kind", "value");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthJobRun_idempotencyKey_key" ON "GrowthJobRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "GrowthJobRun_job_startedAt_idx" ON "GrowthJobRun"("job", "startedAt");

-- CreateIndex
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_garageId_fkey" FOREIGN KEY ("garageId") REFERENCES "Garage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachDraft" ADD CONSTRAINT "OutreachDraft_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
