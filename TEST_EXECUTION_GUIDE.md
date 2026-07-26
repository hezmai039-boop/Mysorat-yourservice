# دليل تنفيذ الاختبارات — Test Execution Guide

**التاريخ: 2026-07-25 | اللغة: العربية والإنجليزية**

---

## جدول المحتويات

1. [التنصيب السريع](#installation)
2. [تشغيل الاختبارات](#running)
3. [استراتيجية testsprite](#testsprite-strategy)
4. [استكشاف الأخطاء](#troubleshooting)
5. [مقاييس الجودة](#quality-metrics)

---

## 1. التنصيب السريع {#installation}

### المتطلبات

```bash
# Node 18+ و npm 9+
node --version  # v18.x أو أعلى
npm --version   # 9.x أو أعلى

# تثبيت Playwright (للاختبارات الآلية)
cd /home/user/Mysorat-yourservice
npm install --save-dev @playwright/test @types/node
```

### التحقق من التنصيب

```bash
# في المجلد الرئيسي للمشروع
npx playwright --version
# Expected: Playwright 1.40+ 

# يجب أن يكون Chromium متوفراً
ls -la /opt/pw-browsers/chromium 2>/dev/null || echo "Chromium path: /opt/pw-browsers"
```

---

## 2. تشغيل الاختبارات {#running}

### أ) اختبارات الصفحات (Playwright E2E)

```bash
# 1. ابدأ بخادم التطوير (في terminal منفصل)
cd frontend
npm run dev
# ينبغي أن يفتح http://localhost:5173

# 2. في terminal آخر، شغّل الاختبارات
cd /home/user/Mysorat-yourservice
npx playwright test tests/e2e/platform.spec.ts --headed

# الخيارات المفيدة:
npx playwright test tests/e2e/platform.spec.ts --headed                 # عرض المتصفح
npx playwright test tests/e2e/platform.spec.ts --headed --debug       # وضع التصحيح (خطوة بخطوة)
npx playwright test tests/e2e/directory.spec.ts --headed              # اختبار المجلد فقط

# تشغيل جميع الاختبارات
npx playwright test tests/e2e/ --headed
```

### ب) الاختبارات اليدوية (Manual Checklist)

```bash
# افتح TEST_SUITE.md وانتقل إلى القسم 7
# استخدم القوائم الموجودة هناك للتحقق اليدوي من كل ميزة

# سريع (5 دقائق):
# استخدم checklist 7.4 (Quick Smoke Test)

# شامل (45 دقيقة):
# استخدم checklists 7.2-7.3 لاختبار كامل
```

### ج) اختبارات الـ API اليدوية (Manual curl tests)

```bash
# ابدأ الخادم الخلفي
cd backend
npm run dev

# في terminal آخر، اختبر الـ endpoints
export TOKEN="your_jwt_token_here"

# اختبر حماية RBAC (يجب 401)
curl -X GET http://localhost:3000/api/ops/queue

# اختبر مع التحقق (يجب 200 أو 403)
curl -X GET http://localhost:3000/api/ops/queue \
  -H "Authorization: Bearer $TOKEN"

# أضف عملية إلى الطابور
curl -X POST http://localhost:3000/api/ops/queue/add \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [{
      "serviceId": "svc_001",
      "userId": "usr_001",
      "status": "PENDING",
      "priority": "HIGH"
    }]
  }'

# جلب قوائم التشغيل (Playbooks)
curl -X GET http://localhost:3000/api/ops/playbooks \
  -H "Authorization: Bearer $TOKEN"

# جلب الموافقات المعلقة
curl -X GET http://localhost:3000/api/ops/approvals \
  -H "Authorization: Bearer $TOKEN"
```

---

## 3. استراتيجية testsprite {#testsprite-strategy}

**testsprite** هي أداة للاختبار البصري (visual regression testing). تقارن لقطات الشاشة لاكتشاف التغييرات المرئية غير المقصودة.

### 3.1 التنصيب والإعداد

```bash
# تثبيت testsprite
npm install --save-dev testsprite

# إنشاء ملف الإعدادات
cat > testsprite.config.js << 'EOF'
export default {
  baseUrl: "http://localhost:5173",
  pages: [
    { name: "directory-light", url: "/", theme: "light" },
    { name: "directory-dark", url: "/", theme: "dark" },
  ],
  breakpoints: [360, 768, 1024, 1440],
  diffThreshold: 0.01,
  browsers: ["chromium"],
};
EOF
```

### 3.2 التقاط لقطات الأساس

```bash
# 1. شغّل خادم التطوير
cd frontend && npm run dev &

# 2. التقط لقطات الأساس (baseline)
npx testsprite baseline

# ينبغي أن ينشئ:
# testsprite/baselines/
#   ├── directory-light-360.png
#   ├── directory-light-768.png
#   ├── directory-light-1024.png
#   ├── directory-light-1440.png
#   ├── directory-dark-360.png
#   ├── directory-dark-768.png
#   ├── directory-dark-1024.png
#   └── directory-dark-1440.png
```

### 3.3 اختبار التغييرات

```bash
# بعد إجراء تغييرات في الكود:
npm run build  # بناء التطبيق

# التقط لقطات جديدة وقارنها مع الأساس
npx testsprite test

# النتائج المتوقعة:
# ✅ directory-light-360: No differences
# ✅ directory-light-768: No differences
# ⚠️  directory-dark-360: 2.3% diff found

# إذا عُثرت على فروقات:
# 1. انظر إلى testsprite/diffs/page-viewport.png
# 2. تحقق من الأجزاء الحمراء المميزة
# 3. قرر: هل هذا التغيير مقصود؟
#    - نعم: npx testsprite approve page-viewport
#    - لا: أصلح الكود وحاول مجددا
```

### 3.4 سيناريوهات الاختبار

#### السيناريو 1: صفحة المجلس — الوضع الفاتح (360px)

```bash
npx testsprite test --page directory-light-360

# التحقق:
# ✅ صندوق البحث مرئي
# ✅ بلاط الفئات مع الألوان
# ✅ بطاقات الخدمات مع الحدود
# ✅ الترقيم "Load more" مرئي
```

#### السيناريو 2: صفحة المجلس — الوضع الداكن (1024px)

```bash
npx testsprite test --page directory-dark-1024

# التحقق:
# ✅ الخلفية داكنة (#0a0a0a)
# ✅ النص فاتح (#f5f5f5)
# ✅ تدرجات الفئات معدّلة للوضع الداكن
# ✅ تباين كافٍ (4.5:1 للنص العادي)
```

#### السيناريو 3: منصة الصفحة الرئيسية (1440px)

```bash
npx testsprite test --page platform-1440

# التحقق:
# ✅ جميع الأقسام مرئية
# ✅ لا يوجد تمرير أفقي
# ✅ النص قابل للقراءة
# ✅ الصور تتكيف مع العرض
```

### 3.5 إدارة الفروقات المقبولة

```bash
# عندما يكون الفرق مقصوداً (مثل تغيير التصميم):
npx testsprite approve directory-light-1440

# سيحدّث ملف الأساس:
# testsprite/baselines/directory-light-1440.png

# ثم التزم به
git add testsprite/baselines/
git commit -m "Update visual baselines for redesign"
```

---

## 4. استكشاف الأخطاء {#troubleshooting}

### المشكلة: "Port 5173 already in use"

```bash
# الحل 1: قتل العملية
lsof -ti:5173 | xargs kill -9

# الحل 2: استخدام منفذ مختلف
cd frontend
npm run dev -- --port 3000
```

### المشكلة: Playwright tests timeout

```bash
# الحل: زيادة المهلة الزمنية في playwright.config.ts
timeout: 60000,  // 60 ثانية بدلاً من 30

# ثم شغّل الاختبارات مجددا
npx playwright test --timeout 60000
```

### المشكلة: "Cannot find browser"

```bash
# تأكد من أن Chromium مثبت
npx playwright install chromium

# أو استخدم المسار المسبق في البيئة
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
npx playwright test
```

### المشكلة: Arabic text not rendering in screenshots

```bash
# السبب المحتمل: الخطوط لم تُحمَّل بعد
# الحل: أضف تأخير قصير قبل لقطة الشاشة

await page.waitForTimeout(500);  // انتظر تحميل الخطوط
await page.screenshot();
```

### المشكلة: Test passes locally but fails in CI

```bash
# السبب المحتمل: DPI مختلفة أو خط مختلف
# الحل 1: تحديد viewport صراحة
await page.setViewportSize({ width: 1440, height: 900 });

# الحل 2: تغيير نسبة الفرق المقبولة
diffThreshold: 0.02,  // 2% بدلاً من 1%
```

---

## 5. مقاييس الجودة {#quality-metrics}

### اختبارات Playwright

```
التغطية:
  ✅ 25+ حالة اختبار (platform.spec.ts)
  ✅ 20+ حالة اختبار (directory.spec.ts)
  ✅ الاختبارات تغطي: التحميل، التفاعل، الاستجابة، الوصولية

معايير النجاح:
  ✅ جميع الاختبارات خضراء (100% pass rate)
  ✅ بدون تحذيرات في console
  ✅ بدون screenshot failures (إلا إذا كان مقصود)
  ✅ وقت التنفيذ < 5 دقائق لـ 45 اختبار
```

### اختبارات testsprite (Visual Regression)

```
التغطية:
  ✅ 8 سيناريوهات (light/dark × 360/768/1024/1440)
  ✅ اختبار الصفحة الكاملة بنقاط انقطاع مختلفة
  ✅ المقارنة مقابل الأساس المعتمد

معايير النجاح:
  ✅ لا توجد فروقات في الاختبارات المقصودة
  ✅ جميع الفروقات المقصودة موافق عليها (في baselines)
  ✅ تقرير diff واضح للفروقات غير المقصودة
```

### اختبارات يدوية (Manual Checklists)

```
التغطية (قوائم من TEST_SUITE.md):
  ✅ 7.1 Ops Room Checklist (12+ items)
  ✅ 7.2 Directory Checklist (30+ items)
  ✅ 7.3 Platform Page Checklist (60+ items)
  ✅ 7.4 Quick Smoke Test (8 items)

معايير النجاح:
  ✅ جميع العناصر المرجعية المحددة بـ ✅ مكتملة
  ✅ لا توجد مشاكل في الاستجابة
  ✅ النص العربي يُعرض بصحة (مع علامات ترقيم)
  ✅ التنقل بلوحة المفاتيح يعمل بشكل سلس
```

### اختبارات API اليدوية (Manual curl tests)

```
Endpoints المختبرة:
  ✅ GET /api/ops/queue
  ✅ GET /api/ops/playbooks
  ✅ GET /api/ops/approvals
  ✅ GET /api/ops/renewals
  ✅ POST /api/ops/playbooks
  ✅ POST /api/ops/approvals/:id/approve
  ✅ POST /api/ops/approvals/:id/reject

معايير النجاح:
  ✅ RBAC guard: 401 بدون تحقق
  ✅ RBAC guard: 403 بدون دور OWNER
  ✅ جميع الـ endpoints: 200 مع بيانات صحيحة
  ✅ معالجة الأخطاء: رسائل خطأ واضحة (400/500)
```

---

## 6. جدول التنفيذ الموصى به

### جلسة اختبار سريعة (15 دقيقة)

```
1. تشغيل Quick Smoke Test (7.4) — 5 دقائق
2. تشغيل Playwright tests — 5 دقائق
   npx playwright test tests/e2e/ --headed
3. التحقق من عدم وجود errors في console — 2 دقيقة
4. إذا كل شيء أخضر: ✅ جاهز للـ push
```

### جلسة اختبار شاملة (90 دقيقة)

```
1. الاختبارات اليدوية الكاملة (7.2-7.3) — 45 دقيقة
   □ اختبار Ops Room
   □ اختبار Directory
   □ اختبار Platform Page
   
2. Playwright tests — 10 دقائق
   npx playwright test tests/e2e/ --headed
   
3. testsprite visual regression — 20 دقيقة
   npx testsprite test
   
4. اختبارات API اليدوية — 10 دقائق
   (استخدم curl commands أعلاه)
   
5. مراجعة النتائج والتقرير — 5 دقائق
   - هل جميع الاختبارات خضراء؟
   - هل هناك أي تحذيرات في console؟
   - هل الاستجابة جيدة على جميع الأجهزة؟
```

---

## 7. تقرير الاختبارات

### نموذج تقرير ختامي

```markdown
# تقرير اختبار — Test Report
**التاريخ**: 2026-07-25
**الفترة**: 90 دقيقة

## ملخص المقاييس

| الفئة | الاختبارات | النجاح | الفشل | التغطية |
|-------|----------|-------|-------|--------|
| Playwright E2E | 45 | 45 | 0 | 100% |
| testsprite Visual | 8 | 8 | 0 | 100% |
| Manual Checklist | 100+ | 100+ | 0 | 100% |
| API Endpoints | 7 | 7 | 0 | 100% |
| **الإجمالي** | **160+** | **160+** | **0** | **100%** |

## النتائج التفصيلية

### ✅ Ops Room
- RBAC guards: ✅ PASS (401/403/200)
- Queue endpoint: ✅ PASS
- Playbooks: ✅ PASS
- Approvals: ✅ PASS
- Renewals: ✅ PASS

### ✅ Directory Page
- Search with normalization: ✅ PASS
- Category filtering: ✅ PASS
- Pagination: ✅ PASS
- Theme toggle: ✅ PASS
- Responsive (360/768/1024/1440px): ✅ PASS

### ✅ Platform Landing Page
- Hero section: ✅ PASS
- Statistics accuracy: ✅ PASS
- Directory integration: ✅ PASS
- Theme switching: ✅ PASS
- Accessibility (WCAG AA): ✅ PASS

### ✅ Performance
- Page load time: < 2.5s
- Canvas render: 2-10ms
- Theme toggle: Instant
- Search: < 100ms

## الخلاصة
جميع المكونات مختبرة وتعمل كما هو متوقع. لا توجد مشاكل معروفة.
✅ **جاهز للـ production**
```

---

## 8. ملاحظات مهمة

### للعمل المستقبلي

1. **Integration CI/CD**: أضف Playwright tests إلى GitHub Actions workflow
   ```yaml
   - name: Run Playwright tests
     run: npx playwright test tests/e2e/
   ```

2. **خط أساس testsprite**: التزم بـ baselines للمقارنة المستقبلية
   ```bash
   git add testsprite/baselines/
   git commit -m "Add visual baselines"
   ```

3. **مراقبة الأداء**: استخدم Lighthouse للمراقبة المستمرة
   ```bash
   npm install -g @lhci/cli@latest
   lhci autorun
   ```

### الموارد المرجعية

- Playwright Docs: https://playwright.dev
- testsprite Docs: https://www.testsprite.io
- WCAG 2.1: https://www.w3.org/WAI/WCAG21/quickref/
- Arabic Typography: https://www.smashingmagazine.com/2012/04/arabic-web-typography-gets-easier-to-read

