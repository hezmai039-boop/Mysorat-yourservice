/*
  Warnings:

  - You are about to drop the column `baseFeeSar` on the `ServiceCatalog` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "verificationNote" TEXT;

-- AlterTable
ALTER TABLE "Operation" ADD COLUMN     "govFeeEstimateSar" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ServiceCatalog" DROP COLUMN "baseFeeSar",
ADD COLUMN     "govFeeEstimateSar" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "platformFeeSar" DECIMAL(10,2) NOT NULL DEFAULT 0;
