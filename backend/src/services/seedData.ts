import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";
import { generateUniqueReferralCode } from "../lib/referral";

// govFeeEstimateSar is an indicative planning figure for what the government
// portal itself charges for the transaction - Mysorat never collects this, it
// is shown to the customer purely so they know what to expect when they
// complete the step on the official government site. It is NOT added to what
// Mysorat charges. The platform's own fee (platformFeeSar, computed below)
// is what actually gets charged via /operations/:id/pay.
import { ServiceAudience } from "@prisma/client";

interface SeedService {
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  descriptionAr: string;
  targetAudience: ServiceAudience[];
  estimatedDays: number;
  govFeeEstimateSar: number;
  requiredDocs: string[];
}

const services: SeedService[] = [
  // ─── خدمات حكومية ───
  {
    code: "GOV_GENERAL",
    nameAr: "إنجاز معاملة حكومية عامة",
    nameEn: "General Government Transaction",
    category: "خدمات حكومية",
    descriptionAr: "وصف معاملتك الحكومية وسيتنافس المختصون على إنجازها معك خطوة بخطوة.",
    targetAudience: ["CITIZEN", "RESIDENT", "VISITOR", "BUSINESS"],
    estimatedDays: 3,
    govFeeEstimateSar: 0,
    requiredDocs: [],
  },
  {
    code: "GOV_FOLLOWUP",
    nameAr: "متابعة معاملة متعثرة",
    nameEn: "Stalled Transaction Follow-up",
    category: "خدمات حكومية",
    descriptionAr: "متابعة معاملة قائمة توقفت أو تأخرت لدى جهة حكومية حتى تتحرك.",
    targetAudience: ["CITIZEN", "RESIDENT", "VISITOR", "BUSINESS"],
    estimatedDays: 5,
    govFeeEstimateSar: 0,
    requiredDocs: ["رقم المعاملة أو مرجعها"],
  },
  {
    code: "GOV_OBJECTION",
    nameAr: "صياغة اعتراض أو تظلم",
    nameEn: "Objection / Appeal Drafting",
    category: "خدمات حكومية",
    descriptionAr: "إعداد وصياغة اعتراض نظامي على قرار أو مخالفة مع إرشادك لتقديمه.",
    targetAudience: ["CITIZEN", "RESIDENT", "VISITOR", "BUSINESS"],
    estimatedDays: 3,
    govFeeEstimateSar: 0,
    requiredDocs: ["صورة القرار أو المخالفة"],
  },
  {
    code: "GOV_RESIDENT",
    nameAr: "خدمات المقيمين والاستقدام",
    nameEn: "Residents & Recruitment Services",
    category: "خدمات حكومية",
    descriptionAr: "إرشاد وإنجاز معاملات الإقامة ونقل الخدمات والاستقدام وفق الأنظمة.",
    targetAudience: ["CITIZEN", "RESIDENT", "BUSINESS"],
    estimatedDays: 5,
    govFeeEstimateSar: 0,
    requiredDocs: [],
  },
  {
    code: "GOV_TRAFFIC",
    nameAr: "خدمات المرور والمركبات",
    nameEn: "Traffic & Vehicles Services",
    category: "خدمات حكومية",
    descriptionAr: "تجديد استمارات، نقل ملكية، وإسقاط مركبات — إرشاد وإنجاز كامل.",
    targetAudience: ["CITIZEN", "RESIDENT"],
    estimatedDays: 2,
    govFeeEstimateSar: 0,
    requiredDocs: [],
  },

  // ─── تأسيس أعمال ───
  {
    code: "EST_CR",
    nameAr: "إصدار سجل تجاري",
    nameEn: "Commercial Registration Issuance",
    category: "تأسيس أعمال",
    descriptionAr: "إصدار سجل تجاري جديد باسمك أو باسم منشأتك مع اختيار الأنشطة الصحيحة.",
    targetAudience: ["CITIZEN", "RESIDENT", "BUSINESS"],
    estimatedDays: 2,
    govFeeEstimateSar: 200,
    requiredDocs: [],
  },
  {
    code: "EST_COMPANY",
    nameAr: "تأسيس شركة (ذ.م.م / مساهمة مبسطة)",
    nameEn: "Company Formation (LLC / SPC)",
    category: "تأسيس أعمال",
    descriptionAr: "تأسيس شركة كاملًا: عقد التأسيس، السجل، والتسجيل في الجهات ذات العلاقة.",
    targetAudience: ["CITIZEN", "RESIDENT", "BUSINESS"],
    estimatedDays: 7,
    govFeeEstimateSar: 0,
    requiredDocs: ["أسماء الشركاء وحصصهم"],
  },
  {
    code: "EST_FREELANCE",
    nameAr: "وثيقة العمل الحر",
    nameEn: "Freelance Certificate",
    category: "تأسيس أعمال",
    descriptionAr: "استخراج وثيقة العمل الحر بالمهنة المناسبة لنشاطك.",
    targetAudience: ["CITIZEN"],
    estimatedDays: 1,
    govFeeEstimateSar: 0,
    requiredDocs: [],
  },
  {
    code: "EST_INVESTOR",
    nameAr: "ترخيص استثمار أجنبي",
    nameEn: "Foreign Investment License",
    category: "تأسيس أعمال",
    descriptionAr: "ترخيص وزارة الاستثمار للمستثمر الأجنبي وتأسيس كيانه في المملكة.",
    targetAudience: ["VISITOR", "BUSINESS"],
    estimatedDays: 14,
    govFeeEstimateSar: 2000,
    requiredDocs: ["السجل التجاري الأجنبي موثقًا"],
  },
  {
    code: "EST_BANK_FILE",
    nameAr: "ملف منشأة كامل (تأمينات، قوى، ضريبة، بنك)",
    nameEn: "Full Establishment File (GOSI, Qiwa, ZATCA, Bank)",
    category: "تأسيس أعمال",
    descriptionAr: "تجهيز ملف المنشأة بعد التأسيس: التأمينات، قوى، الزكاة والضريبة، وفتح الحساب البنكي.",
    targetAudience: ["CITIZEN", "RESIDENT", "BUSINESS"],
    estimatedDays: 7,
    govFeeEstimateSar: 0,
    requiredDocs: ["السجل التجاري"],
  },

  // ─── تراخيص ───
  {
    code: "LIC_MUNICIPAL",
    nameAr: "رخصة بلدية لمحل أو نشاط",
    nameEn: "Municipal Shop License",
    category: "تراخيص",
    descriptionAr: "إصدار أو تجديد الرخصة البلدية لمحلك أو نشاطك التجاري.",
    targetAudience: ["CITIZEN", "RESIDENT", "BUSINESS"],
    estimatedDays: 5,
    govFeeEstimateSar: 0,
    requiredDocs: ["عقد الإيجار الموحد", "السجل التجاري"],
  },
  {
    code: "LIC_FOOD",
    nameAr: "تراخيص الأنشطة الغذائية والصحية",
    nameEn: "Food & Health Activity Licenses",
    category: "تراخيص",
    descriptionAr: "تراخيص المطاعم والمقاهي والأنشطة الصحية مع اشتراطات الجهات المختصة.",
    targetAudience: ["CITIZEN", "RESIDENT", "BUSINESS"],
    estimatedDays: 10,
    govFeeEstimateSar: 0,
    requiredDocs: ["السجل التجاري", "عقد الإيجار الموحد"],
  },
  {
    code: "LIC_ECOMMERCE",
    nameAr: "توثيق متجر إلكتروني",
    nameEn: "E-commerce Store Authentication",
    category: "تراخيص",
    descriptionAr: "توثيق متجرك الإلكتروني في المنصات الرسمية لرفع موثوقيته.",
    targetAudience: ["CITIZEN", "RESIDENT", "BUSINESS"],
    estimatedDays: 2,
    govFeeEstimateSar: 0,
    requiredDocs: ["السجل التجاري أو وثيقة العمل الحر"],
  },
  {
    code: "LIC_PROFESSIONAL",
    nameAr: "ترخيص مهني (هندسي، صحي، تعليمي…)",
    nameEn: "Professional License",
    category: "تراخيص",
    descriptionAr: "استخراج التراخيص المهنية من الهيئات المختصة حسب مجالك.",
    targetAudience: ["CITIZEN", "RESIDENT", "BUSINESS"],
    estimatedDays: 10,
    govFeeEstimateSar: 0,
    requiredDocs: ["المؤهل العلمي"],
  },
  {
    code: "LIC_RENEWAL",
    nameAr: "تجديد التراخيص والاشتراكات الحكومية",
    nameEn: "Government Licenses Renewal",
    category: "تراخيص",
    descriptionAr: "متابعة وتجديد تراخيص منشأتك قبل انتهائها وتفادي الغرامات.",
    targetAudience: ["CITIZEN", "RESIDENT", "BUSINESS"],
    estimatedDays: 3,
    govFeeEstimateSar: 0,
    requiredDocs: [],
  },
];

const links = [
  { nameAr: "أبشر", nameEn: "Absher", url: "https://www.absher.sa", category: "الإقامة والجوازات" },
  { nameAr: "منصة ناجز", nameEn: "Najiz", url: "https://najiz.sa", category: "العدل والتوثيق" },
  { nameAr: "منصة أبشر أفراد", nameEn: "Absher Individuals", url: "https://www.absher.sa/wps/portal/individuals", category: "الهوية والأحوال المدنية" },
  { nameAr: "منصة نُسك", nameEn: "Nusuk", url: "https://nusuk.sa", category: "تأشيرات الزيارة والسياحة" },
  { nameAr: "التأشيرة السياحية السعودية", nameEn: "Visit Saudi eVisa", url: "https://visa.visitsaudi.com", category: "تأشيرات الزيارة والسياحة" },
  { nameAr: "أبشر مركبتي", nameEn: "Absher Vehicles", url: "https://www.absher.sa", category: "المرور والمركبات" },
  { nameAr: "صحتي", nameEn: "Sehhaty", url: "https://sehhaty.sa", category: "الصحة" },
  { nameAr: "نظام نور", nameEn: "Noor", url: "https://noor.moe.gov.sa", category: "التعليم" },
  { nameAr: "منصة إيجار", nameEn: "Ejar", url: "https://ejar.sa", category: "الإسكان والعقار" },
  { nameAr: "منصة بلدي", nameEn: "Balady", url: "https://balady.gov.sa", category: "البلدية والمرافق" },
  { nameAr: "منصة اعتماد", nameEn: "Etimad", url: "https://etimad.sa", category: "الأعمال والاستثمار" },
  { nameAr: "وزارة الاستثمار", nameEn: "MISA", url: "https://misa.gov.sa", category: "الأعمال والاستثمار" },
  { nameAr: "هيئة الزكاة والضريبة والجمارك", nameEn: "ZATCA", url: "https://zatca.gov.sa", category: "المالية" },
  { nameAr: "التأمينات الاجتماعية", nameEn: "GOSI", url: "https://gosi.gov.sa", category: "الموارد البشرية" },
  { nameAr: "منصة قوى", nameEn: "Qiwa", url: "https://qiwa.sa", category: "الموارد البشرية" },
  { nameAr: "منصة ساند", nameEn: "SANED", url: "https://saned.gosi.gov.sa", category: "الموارد البشرية" },
  { nameAr: "وزارة التجارة", nameEn: "MCI", url: "https://mc.gov.sa", category: "الأعمال والاستثمار" },
];

// Mysorat's own assistance fee reflects the platform's effort (AI guidance,
// tracking, document handling) - deliberately derived from estimatedDays
// rather than from govFeeEstimateSar, so it can never look like a markup on
// the government's own charge.
function computePlatformFeeSar(estimatedDays: number): number {
  return Math.min(30, Math.max(10, estimatedDays * 3));
}

export async function seedDatabase() {
  const ownerEmail = process.env.OWNER_EMAIL?.trim() ?? "owner@mysorat.sa";
  const ownerPassword = process.env.OWNER_PASSWORD?.trim() ?? "ChangeMe123!";

  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    create: {
      email: ownerEmail,
      passwordHash: await bcrypt.hash(ownerPassword, 12),
      role: "OWNER",
      referralCode: await generateUniqueReferralCode(),
    },
    update: {},
  });

  for (const service of services) {
    const data = {
      ...service,
      requiredDocs: [...service.requiredDocs],
      targetAudience: [...service.targetAudience],
      platformFeeSar: computePlatformFeeSar(service.estimatedDays),
    };
    await prisma.serviceCatalog.upsert({ where: { code: service.code }, create: data, update: data });
  }

  let linksCreated = 0;
  for (const link of links) {
    const existing = await prisma.governmentLink.findFirst({ where: { url: link.url } });
    if (!existing) {
      await prisma.governmentLink.create({ data: link });
      linksCreated++;
    }
  }

  return {
    ownerEmail: owner.email,
    servicesUpserted: services.length,
    linksCreated,
  };
}
