-- ========================================================================
-- إصلاح فوري لمشكلة "العملية غير موجودة" في ميسوور
-- السبب: قاعدة البيانات ناقصها 3 أعمدة يتوقعها الكود الجديد، فيفشل كل
--        استعلام عن أي عملية بخطأ 500 يظهر كـ "العملية غير موجودة".
-- شغّل هذا مرة واحدة على قاعدة بياناتك (Neon SQL Editor أو Render psql).
-- آمن تماماً: IF NOT EXISTS يعني لن يضر إذا كانت الأعمدة موجودة أصلاً.
-- ========================================================================

ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;
ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "User"      ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
