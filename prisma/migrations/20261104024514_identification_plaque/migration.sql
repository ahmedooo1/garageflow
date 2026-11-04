-- CreateEnum
CREATE TYPE "PlateLookupStatus" AS ENUM ('FOUND', 'NOT_FOUND', 'ERROR');

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "engine" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "firstRegistrationDate" DATE,
ADD COLUMN     "fiscalPower" INTEGER,
ADD COLUMN     "gearbox" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "powerKw" INTEGER,
ADD COLUMN     "technicalConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "technicalSource" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "version" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "PlateLookup" (
    "id" TEXT NOT NULL,
    "garageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plateHash" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "PlateLookupStatus" NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "fromCache" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB,
    "errorCode" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlateLookup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlateLookup_garageId_createdAt_idx" ON "PlateLookup"("garageId", "createdAt");

-- CreateIndex
CREATE INDEX "PlateLookup_garageId_plateHash_createdAt_idx" ON "PlateLookup"("garageId", "plateHash", "createdAt");

-- CreateIndex
CREATE INDEX "PlateLookup_createdAt_idx" ON "PlateLookup"("createdAt");

-- AddForeignKey
ALTER TABLE "PlateLookup" ADD CONSTRAINT "PlateLookup_garageId_fkey" FOREIGN KEY ("garageId") REFERENCES "Garage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
