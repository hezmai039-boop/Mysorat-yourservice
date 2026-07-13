# ميسوور (Mysorat) — المستشار الرقمي للخدمات الحكومية

منصة SaaS تشخّص احتياج المستخدم من الخدمات الحكومية السعودية وتوجهه خطوة بخطوة
حتى الإنجاز، عبر مساعد ذكي مبني على Claude، مع لوحات تحكم منفصلة للأفراد
والمنشآت والخبراء ومالك المنصة.

## البنية

```
backend/    Node.js + Express + TypeScript + PostgreSQL (Prisma) + Claude API
frontend/   React + TypeScript + Vite + Tailwind CSS (RTL, Cairo font)
```

## المزايا المطبّقة

- تسجيل دخول مع اختيار نوع الحساب (أفراد / مؤسسات وشركات) — بيانات كل نوع
  محفوظة بشكل مستقل وقابلة للتصدير (يومي/أسبوعي/شهري) من لوحة المالك.
- مساعد ذكي (نص / صوت عبر Web Speech API / صورة عبر Claude Vision) يشخّص
  الخدمة المطلوبة وينشئ معاملة تلقائياً بخطواتها ومستنداتها المطلوبة.
- تتبع خطوة بخطوة، مع تمييز كل خطوة كـ"تلقائي" أو "من خبير" (يظهر فقط لمالك
  المنصة والخبير؛ العميل يرى فقط أين وصل الإجراء).
- تقييم إجباري (نجوم + تعليق نصي أو صوتي محوّل لنص) قبل إغلاق أي معاملة،
  مع عداد تعليقات ورد الإدارة.
- تحويل المعاملات المتعثرة إلى خبير بشري (escalation) مع تسجيل كامل في سجل
  التدقيق (Audit Log).
- سجل روابط حكومية مع فحص تلقائي للروابط التالفة (`npm run check-links`).
- قاعدة معرفة (Knowledge Base) تحفظ خطوات كل خدمة بعد أول تنفيذ ناجح، بحيث
  تتسارع المعاملات المتكررة لنفس الخدمة.
- لوحة مالك شاملة: إحصاءات، تصدير CSV، إدارة الروابط، الرد على التعليقات،
  إدارة الخبراء.
- مصادقة ثنائية (2FA) عبر تطبيقات المصادقة (Google Authenticator وما شابه)
  قابلة للتفعيل من صفحة الإعدادات، مع رمز QR وتحقق عند تسجيل الدخول.
- الوقت المتوقع لإنجاز كل معاملة يظهر للعميل، مع رسالة طمأنة واضحة في حال
  حدوث تأخير بدل تركه بلا تفسير.

## التشغيل محلياً

### المتطلبات
- Node.js 20+
- PostgreSQL (أو Docker)

### 1. قاعدة البيانات
```bash
docker compose up -d postgres
```

### 2. الخادم (Backend)
```bash
cd backend
cp .env.example .env   # عدّل القيم، خصوصاً DATABASE_URL و ANTHROPIC_API_KEY
npm install
npm run prisma:migrate
npm run seed            # ينشئ حساب المالك والخدمات الحكومية الأساسية
npm run dev              # http://localhost:4000
```

### 3. الواجهة (Frontend)
```bash
cd frontend
cp .env.example .env
npm install
npm run dev               # http://localhost:5173
```

سجّل الدخول بحساب المالك الافتراضي (`OWNER_EMAIL` / `OWNER_PASSWORD` في `.env`)
للوصول إلى لوحة الإدارة على `/admin`.

## النشر (Deployment)

### الواجهة → Vercel
1. استورد مجلد `frontend/` كمشروع في Vercel.
2. اضبط متغير البيئة `VITE_API_BASE_URL` إلى رابط الخادم الخلفي المنشور
   (مثال: `https://mysorat-backend.onrender.com`).
3. Vercel سيستخدم `vercel.json` الموجود تلقائياً (build عبر `npm run build`,
   مخرجات `dist/`).

### الخادم الخلفي → Render (أو أي مزود Docker)
1. أنشئ خدمة Web Service جديدة في Render وأشر إلى مجلد `backend/`
   (يحتوي على `Dockerfile` و `render.yaml`).
2. اضبط متغيرات البيئة: `DATABASE_URL`، `JWT_SECRET`، `ANTHROPIC_API_KEY`،
   `CORS_ORIGIN` (رابط الواجهة على Vercel).
3. بعد أول نشر، شغّل الترحيل والبذر:
   ```bash
   npx prisma migrate deploy
   npm run seed
   ```

### قاعدة البيانات → Neon.tech
أنشئ مشروع PostgreSQL على [Neon](https://neon.tech) واستخدم رابط الاتصال
(connection string) كقيمة لـ `DATABASE_URL`.

## ملاحظات مهمة قبل الإنتاج الفعلي

- **الدفع الحكومي/رسوم الخدمة**: مسار `/operations/:id/pay` حالياً يُفعّل
  الدفع مباشرة لأغراض العرض التجريبي. يجب ربطه ببوابة دفع حقيقية (مدى/STC Pay/
  Moyasar) قبل الإطلاق الفعلي.
- **رفع الملفات**: التخزين حالياً على القرص المحلي للخادم (`backend/uploads`)،
  وهو غير مناسب لبيئات الاستضافة السحابية عديمة الحالة (Vercel/Render
  الطبقة المجانية). يجب استبداله بتخزين سحابي (S3، Vercel Blob) قبل الإنتاج.
- **تكامل الأنظمة الحكومية**: التقدم في خطوات المعاملة حالياً يُحاكى عبر
  مسار `/operations/:id/advance`، تمهيداً لاستبداله بتكامل فعلي مع أنظمة
  أبشر وقوى وغيرها عند توفر الوصول الرسمي (API/RPA).
- **التوسع الأفقي**: الحد من معدل الطلبات (rate limiting) حالياً في الذاكرة
  (per-instance). عند تشغيل أكثر من نسخة من الخادم خلف موازن أحمال، أضف
  Redis (مثل Upstash) كمخزن مشترك لـ `express-rate-limit` عبر
  `rate-limit-redis`.

## فحص الروابط الحكومية دورياً

```bash
cd backend
npm run check-links
```

يمكن جدولة هذا الأمر عبر Render Cron Job أو GitHub Actions للتشغيل اليومي.
