import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const services = [
  {
    code: "IQAMA_RENEWAL",
    nameAr: "تجديد الإقامة",
    nameEn: "Iqama Renewal",
    category: "الإقامة والجوازات",
    estimatedDays: 2,
    baseFeeSar: 50,
    requiredDocs: ["صورة الإقامة الحالية", "تعهد سداد الرسوم"],
  },
  {
    code: "SPONSORSHIP_TRANSFER",
    nameAr: "نقل الكفالة",
    nameEn: "Sponsorship Transfer",
    category: "الإقامة والجوازات",
    estimatedDays: 5,
    baseFeeSar: 120,
    requiredDocs: ["موافقة الكفيل الحالي", "عقد العمل الجديد", "صورة الإقامة"],
  },
  {
    code: "PASSPORT_VISA",
    nameAr: "الجوازات والتأشيرات",
    nameEn: "Passports & Visas",
    category: "الإقامة والجوازات",
    estimatedDays: 3,
    baseFeeSar: 80,
    requiredDocs: ["صورة جواز السفر", "صورة شخصية حديثة"],
  },
  {
    code: "COMMERCIAL_REGISTRY",
    nameAr: "السجل التجاري والتراخيص",
    nameEn: "Commercial Registry & Licensing",
    category: "الأعمال والاستثمار",
    estimatedDays: 4,
    baseFeeSar: 200,
    requiredDocs: ["عقد التأسيس", "إثبات العنوان الوطني", "صورة الهوية"],
  },
  {
    code: "MISA_INVESTMENT",
    nameAr: "الاستثمار الأجنبي",
    nameEn: "Foreign Investment License (MISA)",
    category: "الأعمال والاستثمار",
    estimatedDays: 7,
    baseFeeSar: 2000,
    requiredDocs: ["خطة العمل", "إثبات رأس المال", "جواز السفر", "السجل التجاري بالدولة الأم"],
  },
  {
    code: "ZATCA_TAX",
    nameAr: "الزكاة والضريبة",
    nameEn: "Zakat & Tax (ZATCA)",
    category: "المالية",
    estimatedDays: 3,
    baseFeeSar: 100,
    requiredDocs: ["القوائم المالية", "السجل التجاري"],
  },
  {
    code: "GOSI",
    nameAr: "التأمينات الاجتماعية",
    nameEn: "Social Insurance (GOSI)",
    category: "الموارد البشرية",
    estimatedDays: 2,
    baseFeeSar: 60,
    requiredDocs: ["كشف الرواتب", "عقود الموظفين"],
  },
  {
    code: "MUDAD_HR",
    nameAr: "الموارد البشرية (مساند)",
    nameEn: "HR Services (Mudad)",
    category: "الموارد البشرية",
    estimatedDays: 2,
    baseFeeSar: 60,
    requiredDocs: ["كشف الرواتب", "بيانات الموظفين"],
  },
];

const links = [
  { nameAr: "أبشر", nameEn: "Absher", url: "https://www.absher.sa", category: "الإقامة والجوازات" },
  { nameAr: "وزارة الاستثمار", nameEn: "MISA", url: "https://misa.gov.sa", category: "الأعمال والاستثمار" },
  { nameAr: "هيئة الزكاة والضريبة والجمارك", nameEn: "ZATCA", url: "https://zatca.gov.sa", category: "المالية" },
  { nameAr: "التأمينات الاجتماعية", nameEn: "GOSI", url: "https://gosi.gov.sa", category: "الموارد البشرية" },
  { nameAr: "منصة قوى", nameEn: "Qiwa", url: "https://qiwa.sa", category: "الموارد البشرية" },
  { nameAr: "وزارة التجارة", nameEn: "MCI", url: "https://mc.gov.sa", category: "الأعمال والاستثمار" },
];

async function main() {
  const ownerEmail = process.env.OWNER_EMAIL ?? "owner@mysorat.sa";
  const ownerPassword = process.env.OWNER_PASSWORD ?? "ChangeMe123!";

  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    create: {
      email: ownerEmail,
      passwordHash: await bcrypt.hash(ownerPassword, 12),
      role: "OWNER",
    },
    update: {},
  });
  console.log(`مالك المنصة: ${owner.email}`);

  for (const service of services) {
    await prisma.serviceCatalog.upsert({
      where: { code: service.code },
      create: service,
      update: service,
    });
  }
  console.log(`تم إضافة ${services.length} خدمة حكومية`);

  for (const link of links) {
    const existing = await prisma.governmentLink.findFirst({ where: { url: link.url } });
    if (!existing) {
      await prisma.governmentLink.create({ data: link });
    }
  }
  console.log(`تم إضافة ${links.length} رابط حكومي`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
