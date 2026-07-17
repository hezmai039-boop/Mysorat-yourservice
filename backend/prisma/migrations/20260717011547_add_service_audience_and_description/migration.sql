-- CreateEnum
CREATE TYPE "ServiceAudience" AS ENUM ('CITIZEN', 'RESIDENT', 'VISITOR', 'BUSINESS');

-- AlterTable
ALTER TABLE "ServiceCatalog" ADD COLUMN     "descriptionAr" TEXT,
ADD COLUMN     "targetAudience" "ServiceAudience"[];

-- CreateIndex
CREATE INDEX "ServiceCatalog_category_idx" ON "ServiceCatalog"("category");
