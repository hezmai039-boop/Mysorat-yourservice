-- عمولة المنصة (Take-Rate): تُحسب عند قبول العرض وتُخصم من الخبير.
-- العميل يدفع سعر العرض كاملاً؛ feeAmountSar لا يتغير.
-- بصيغة idempotent كبقية ترحيلات المشروع (انظر CLAUDE.md).

-- AlterTable
ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "platformCommissionSar" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "expertPayoutSar" DECIMAL(10,2) NOT NULL DEFAULT 0;
