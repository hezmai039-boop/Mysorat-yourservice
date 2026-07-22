import Anthropic from "@anthropic-ai/sdk";
import { env } from "../lib/env";

/**
 * "Guided execution" (المساعد المنفّذ) - an additive, opaque-to-the-customer
 * view over an EXISTING operation. It never stores its own workflow and never
 * changes how operations/steps/documents already behave: it purely DERIVES,
 * from the operation's real state (fee paid, document statuses, step
 * completion), the single next thing the customer must personally do - like a
 * doctor handing over one prescription at a time rather than walking the
 * patient through the whole pharmacy. Everything the platform/experts/agencies
 * handle stays "behind the curtain" as a reassuring status, not a checklist.
 *
 * Because the phase is computed from the same truths the tracker uses, the two
 * views can never disagree, and an operation created before this feature
 * existed works with zero backfill.
 */

type Lang = "ar" | "en";

export type GuidedPhase =
  | "PAY"
  | "UPLOAD"
  | "FIX_REJECTED"
  | "UNDER_REVIEW"
  | "PROCESSING"
  | "DONE"
  | "CANCELLED";

export interface GuidedAction {
  kind: "PAYMENT" | "DOCUMENT";
  titleAr: string;
  titleEn: string;
  instructionsAr: string;
  instructionsEn: string;
  docId?: string;
  docType?: string;
}

export interface GuidedBehindCurtain {
  messageAr: string;
  messageEn: string;
  expectedDays?: number;
}

export interface GuidedState {
  phase: GuidedPhase;
  /** The one task the customer must do now (null when it's on us, not them). */
  action: GuidedAction | null;
  /** What Mysorat / an expert / the agency is handling silently for them. */
  behindCurtain: GuidedBehindCurtain | null;
  progress: { done: number; total: number; percent: number };
}

/** Minimal shape needed - structurally compatible with loadOperationOrThrow. */
interface OperationLike {
  status: string;
  feePaid: boolean;
  service: { code: string; nameAr: string; nameEn: string };
  documents: { id: string; docType: string; status: string; verificationNote?: string | null }[];
  steps: { status: string }[];
}

/**
 * Per-service overrides that make the "behind the curtain" wording and the
 * named portal concrete instead of generic. Any service not listed here still
 * works - it just uses the generic portal wording. Grow this map over time; it
 * needs no migration and no schema.
 */
const SERVICE_GUIDES: Record<
  string,
  { portalAr: string; portalEn: string; processingAr?: string; processingEn?: string; processingDays?: number }
> = {
  // --- الهوية والأحوال المدنية ---
  NATIONAL_ID_ISSUE: {
    portalAr: 'منصة "أبشر أفراد"',
    portalEn: 'the "Absher" portal',
    processingAr: "نُصدر الآن بطاقة هويتك لدى الأحوال المدنية بعد اكتمال بياناتك",
    processingEn: "We are now issuing your national ID with Civil Affairs",
    processingDays: 5,
  },
  NATIONAL_ID_RENEWAL: {
    portalAr: 'منصة "أبشر أفراد"',
    portalEn: 'the "Absher" portal',
    processingAr: "نجدّد الآن بطاقة هويتك لدى الأحوال المدنية",
    processingEn: "We are now renewing your national ID with Civil Affairs",
    processingDays: 3,
  },
  FAMILY_REGISTER: {
    portalAr: 'منصة "أبشر أفراد"',
    portalEn: 'the "Absher" portal',
    processingAr: "نُصدر الآن سجل الأسرة لدى الأحوال المدنية",
    processingEn: "We are now issuing your family register with Civil Affairs",
    processingDays: 3,
  },
  BIRTH_CERTIFICATE: {
    portalAr: 'منصة "أبشر أفراد"',
    portalEn: 'the "Absher" portal',
    processingAr: "نُصدر الآن شهادة الميلاد لدى الأحوال المدنية",
    processingEn: "We are now issuing the birth certificate with Civil Affairs",
    processingDays: 3,
  },
  DEATH_CERTIFICATE: {
    portalAr: 'منصة "أبشر أفراد"',
    portalEn: 'the "Absher" portal',
    processingAr: "نُصدر الآن شهادة الوفاة لدى الأحوال المدنية",
    processingEn: "We are now issuing the death certificate with Civil Affairs",
    processingDays: 3,
  },
  MARRIAGE_CONTRACT: {
    portalAr: 'منصة "ناجز" (وزارة العدل)',
    portalEn: 'the "Najiz" portal (Ministry of Justice)',
    processingAr: "نوثّق الآن عقد الزواج لدى المحكمة/المأذون عبر ناجز",
    processingEn: "We are now documenting the marriage contract via Najiz",
    processingDays: 3,
  },
  DIVORCE_DOCUMENTATION: {
    portalAr: 'منصة "ناجز" (وزارة العدل)',
    portalEn: 'the "Najiz" portal (Ministry of Justice)',
    processingAr: "نوثّق الآن الطلاق لدى المحكمة عبر ناجز",
    processingEn: "We are now documenting the divorce via Najiz",
    processingDays: 3,
  },
  // --- الإقامة والجوازات ---
  IQAMA_RENEWAL: {
    portalAr: 'منصة "أبشر"',
    portalEn: 'the "Absher" portal',
    processingAr: "نعالج الآن تجديد الإقامة لدى الجوازات بعد اكتمال مستنداتك",
    processingEn: "We are now processing your Iqama renewal with Jawazat",
    processingDays: 2,
  },
  SPONSORSHIP_TRANSFER: {
    portalAr: 'منصة "قوى" عبر النفاذ الوطني الموحّد',
    portalEn: 'the "Qiwa" portal via Nafath',
    processingAr: "نتابع الآن موافقة الكفيل الحالي ومعالجة الجوازات لإتمام نقل الكفالة",
    processingEn: "We are now following up the current sponsor's approval and Jawazat processing to complete the transfer",
    processingDays: 3,
  },
  PASSPORT_VISA: {
    portalAr: 'منصة "أبشر"',
    portalEn: 'the "Absher" portal',
    processingAr: "نعالج الآن طلب الجواز/التأشيرة لدى الجوازات",
    processingEn: "We are now processing your passport/visa request with Jawazat",
    processingDays: 5,
  },
  EXIT_REENTRY_VISA: {
    portalAr: 'منصة "أبشر"',
    portalEn: 'the "Absher" portal',
    processingAr: "نصدر الآن تأشيرة الخروج والعودة لدى الجوازات",
    processingEn: "We are now issuing your exit-reentry visa with Jawazat",
    processingDays: 1,
  },
  FINAL_EXIT_VISA: {
    portalAr: 'منصة "أبشر"',
    portalEn: 'the "Absher" portal',
    processingAr: "نصدر الآن تأشيرة الخروج النهائي لدى الجوازات",
    processingEn: "We are now issuing your final exit visa with Jawazat",
    processingDays: 2,
  },
  FAMILY_VISIT_VISA: {
    portalAr: 'منصة التأشيرات (وزارة الخارجية)',
    portalEn: 'the visa platform (Ministry of Foreign Affairs)',
    processingAr: "نعالج الآن طلب تأشيرة الزيارة العائلية لدى الخارجية",
    processingEn: "We are now processing the family visit visa with the Foreign Ministry",
    processingDays: 3,
  },
  // --- تأشيرات الزيارة والسياحة ---
  TOURIST_EVISA: {
    portalAr: 'منصة "التأشيرة السياحية"',
    portalEn: 'the "Visit Saudi" eVisa platform',
    processingAr: "نُصدر الآن تأشيرتك السياحية إلكترونياً",
    processingEn: "We are now issuing your tourist eVisa",
    processingDays: 1,
  },
  UMRAH_VISA: {
    portalAr: 'منصة "نُسك"',
    portalEn: 'the "Nusuk" platform',
    processingAr: "نُصدر الآن تأشيرة العمرة عبر نُسك",
    processingEn: "We are now issuing your Umrah visa via Nusuk",
    processingDays: 2,
  },
  VISIT_VISA_EXTENSION: {
    portalAr: 'منصة "أبشر"',
    portalEn: 'the "Absher" portal',
    processingAr: "نمدّد الآن تأشيرة الزيارة لدى الجوازات",
    processingEn: "We are now extending the visit visa with Jawazat",
    processingDays: 2,
  },
  VISITOR_TRAVEL_INSURANCE: {
    portalAr: "منصة التأمين المعتمدة",
    portalEn: "the approved insurance platform",
    processingAr: "نُصدر الآن وثيقة تأمين السفر للزائر",
    processingEn: "We are now issuing the visitor travel insurance policy",
    processingDays: 1,
  },
  // --- المرور والمركبات ---
  DRIVING_LICENSE_ISSUE: {
    portalAr: 'منصة "أبشر" (خدمات المرور)',
    portalEn: 'the "Absher" portal (Traffic services)',
    processingAr: "نُصدر الآن رخصة القيادة لدى إدارة المرور بعد اجتياز المتطلبات",
    processingEn: "We are now issuing your driving license with the Traffic Department",
    processingDays: 3,
  },
  DRIVING_LICENSE_RENEWAL: {
    portalAr: 'منصة "أبشر" (خدمات المرور)',
    portalEn: 'the "Absher" portal (Traffic services)',
    processingAr: "نعالج الآن تجديد رخصتك لدى إدارة المرور",
    processingEn: "We are now processing your license renewal with the Traffic Department",
    processingDays: 2,
  },
  VEHICLE_REGISTRATION_RENEWAL: {
    portalAr: 'منصة "أبشر مركبتي"',
    portalEn: 'the "Absher" vehicles portal',
    processingAr: "نجدّد الآن استمارة مركبتك لدى إدارة المرور",
    processingEn: "We are now renewing your vehicle registration with the Traffic Department",
    processingDays: 2,
  },
  VEHICLE_OWNERSHIP_TRANSFER: {
    portalAr: 'منصة "أبشر مركبتي"',
    portalEn: 'the "Absher" vehicles portal',
    processingAr: "نعالج الآن نقل ملكية المركبة لدى إدارة المرور",
    processingEn: "We are now processing the vehicle ownership transfer with the Traffic Department",
    processingDays: 2,
  },
  TRAFFIC_VIOLATION_PAYMENT: {
    portalAr: 'منصة "أبشر" / سداد',
    portalEn: 'the "Absher" portal / SADAD',
    processingAr: "نؤكّد الآن سداد مخالفاتك لدى إدارة المرور",
    processingEn: "We are now confirming your traffic-violation payment with the Traffic Department",
    processingDays: 1,
  },
  VEHICLE_INSURANCE: {
    portalAr: 'منصة "نجم" / شركات التأمين المعتمدة',
    portalEn: 'the "Najm" platform / approved insurers',
    processingAr: "نُصدر الآن وثيقة تأمين مركبتك",
    processingEn: "We are now issuing your vehicle insurance policy",
    processingDays: 1,
  },
  // --- الصحة ---
  HEALTH_APPOINTMENT: {
    portalAr: 'تطبيق "صحتي"',
    portalEn: 'the "Sehhaty" app',
    processingAr: "نؤكّد الآن حجز موعدك الصحي عبر صحتي",
    processingEn: "We are now confirming your health appointment via Sehhaty",
    processingDays: 1,
  },
  RESIDENT_HEALTH_INSURANCE: {
    portalAr: "مجلس الضمان الصحي / شركة التأمين",
    portalEn: "the Council of Health Insurance / insurer",
    processingAr: "نُصدر الآن وثيقة التأمين الصحي",
    processingEn: "We are now issuing your health insurance policy",
    processingDays: 2,
  },
  VACCINATION_CERTIFICATE: {
    portalAr: 'تطبيق "صحتي" / "توكلنا"',
    portalEn: 'the "Sehhaty" / "Tawakkalna" apps',
    processingAr: "نُصدر الآن شهادة التطعيمات عبر صحتي",
    processingEn: "We are now issuing your vaccination certificate via Sehhaty",
    processingDays: 1,
  },
  // --- التعليم ---
  CERTIFICATE_EQUIVALENCY: {
    portalAr: "منصة معادلة الشهادات (وزارة التعليم)",
    portalEn: "the certificate-equivalency platform (Ministry of Education)",
    processingAr: "نعالج الآن معادلة شهادتك لدى وزارة التعليم",
    processingEn: "We are now processing your certificate equivalency with the Ministry of Education",
    processingDays: 5,
  },
  NOOR_REGISTRATION: {
    portalAr: 'نظام "نور" التعليمي',
    portalEn: 'the "Noor" education system',
    processingAr: "نُكمل الآن تسجيل الطالب في نظام نور",
    processingEn: "We are now completing the student registration in Noor",
    processingDays: 2,
  },
  // --- الإسكان والعقار ---
  EJAR_RENTAL_CONTRACT: {
    portalAr: 'منصة "إيجار"',
    portalEn: 'the "Ejar" platform',
    processingAr: "نوثّق الآن عقد الإيجار عبر منصة إيجار",
    processingEn: "We are now documenting the rental contract via Ejar",
    processingDays: 1,
  },
  PROPERTY_TITLE_DEED: {
    portalAr: 'منصة "ناجز" (كتابة العدل)',
    portalEn: 'the "Najiz" portal (Notary)',
    processingAr: "نُصدر الآن صك الملكية لدى كتابة العدل عبر ناجز",
    processingEn: "We are now issuing the title deed with the Notary via Najiz",
    processingDays: 5,
  },
  // --- البلدية والمرافق ---
  BUILDING_PERMIT: {
    portalAr: 'منصة "بلدي"',
    portalEn: 'the "Balady" platform',
    processingAr: "نعالج الآن رخصة البناء لدى البلدية عبر بلدي",
    processingEn: "We are now processing your building permit with the municipality via Balady",
    processingDays: 5,
  },
  ELECTRICITY_CONNECTION: {
    portalAr: "الشركة السعودية للكهرباء",
    portalEn: "the Saudi Electricity Company",
    processingAr: "نعالج الآن طلب توصيل الكهرباء لدى الشركة السعودية للكهرباء",
    processingEn: "We are now processing your electricity connection with the Saudi Electricity Company",
    processingDays: 5,
  },
  WATER_CONNECTION: {
    portalAr: "شركة المياه الوطنية",
    portalEn: "the National Water Company",
    processingAr: "نعالج الآن طلب توصيل المياه لدى شركة المياه الوطنية",
    processingEn: "We are now processing your water connection with the National Water Company",
    processingDays: 5,
  },
  // --- العدل والتوثيق ---
  POWER_OF_ATTORNEY: {
    portalAr: 'منصة "ناجز" (كتابة العدل)',
    portalEn: 'the "Najiz" portal (Notary)',
    processingAr: "نوثّق الآن الوكالة لدى كتابة العدل عبر ناجز",
    processingEn: "We are now documenting the power of attorney via Najiz",
    processingDays: 2,
  },
  ECOURT_FILING: {
    portalAr: 'منصة "ناجز" (وزارة العدل)',
    portalEn: 'the "Najiz" portal (Ministry of Justice)',
    processingAr: "نرفع الآن دعواك القضائية إلكترونياً عبر ناجز",
    processingEn: "We are now filing your court case electronically via Najiz",
    processingDays: 3,
  },
  // --- الأعمال والاستثمار ---
  COMMERCIAL_REGISTRY: {
    portalAr: "المركز السعودي للأعمال (وزارة التجارة)",
    portalEn: "the Saudi Business Center (Ministry of Commerce)",
    processingAr: "نعالج الآن سجلك التجاري لدى وزارة التجارة",
    processingEn: "We are now processing your commercial registration with the Ministry of Commerce",
    processingDays: 2,
  },
  MISA_INVESTMENT: {
    portalAr: "وزارة الاستثمار",
    portalEn: "the Ministry of Investment (MISA)",
    processingAr: "نعالج الآن ترخيص الاستثمار الأجنبي لدى وزارة الاستثمار",
    processingEn: "We are now processing your foreign-investment license with MISA",
    processingDays: 5,
  },
  BALADY_BUSINESS_LICENSE: {
    portalAr: 'منصة "بلدي"',
    portalEn: 'the "Balady" platform',
    processingAr: "نُصدر الآن الرخصة البلدية لنشاطك عبر بلدي",
    processingEn: "We are now issuing your municipal business license via Balady",
    processingDays: 3,
  },
  ETIMAD_REGISTRATION: {
    portalAr: 'منصة "اعتماد"',
    portalEn: 'the "Etimad" platform',
    processingAr: "نُكمل الآن تسجيلك في منصة اعتماد",
    processingEn: "We are now completing your registration on Etimad",
    processingDays: 2,
  },
  // --- المالية ---
  ZATCA_TAX: {
    portalAr: "هيئة الزكاة والضريبة والجمارك",
    portalEn: "ZATCA",
    processingAr: "نعالج الآن إقرارك لدى هيئة الزكاة والضريبة والجمارك",
    processingEn: "We are now processing your filing with ZATCA",
    processingDays: 3,
  },
  VAT_REGISTRATION: {
    portalAr: "هيئة الزكاة والضريبة والجمارك",
    portalEn: "ZATCA",
    processingAr: "نُكمل الآن تسجيلك في ضريبة القيمة المضافة لدى هيئة الزكاة والضريبة",
    processingEn: "We are now completing your VAT registration with ZATCA",
    processingDays: 2,
  },
  // --- الموارد البشرية ---
  GOSI: {
    portalAr: "التأمينات الاجتماعية",
    portalEn: "GOSI",
    processingAr: "نعالج الآن طلبك لدى المؤسسة العامة للتأمينات الاجتماعية",
    processingEn: "We are now processing your request with GOSI",
    processingDays: 2,
  },
  MUDAD_HR: {
    portalAr: 'منصة "مدد"',
    portalEn: 'the "Mudad" platform',
    processingAr: "نُكمل الآن إجراء الموارد البشرية عبر منصة مدد",
    processingEn: "We are now completing your HR procedure via Mudad",
    processingDays: 2,
  },
  UNEMPLOYMENT_INSURANCE_SANED: {
    portalAr: 'منصة "ساند"',
    portalEn: 'the "SANED" platform',
    processingAr: "نعالج الآن طلب تأمين ساند للتعطل عن العمل",
    processingEn: "We are now processing your SANED unemployment-insurance claim",
    processingDays: 3,
  },
};

const GENERIC_PORTAL_AR = "البوابة الحكومية الرسمية للخدمة";
const GENERIC_PORTAL_EN = "the official government portal for this service";

/**
 * Type-specific capture tips appended to a document instruction so the customer
 * gets the file right on the first try - a bad photo, not the wrong document,
 * is the biggest cause of a rejected upload. Matched by keyword against the
 * free-text docType, most specific first, with a safe generic fallback so an
 * unseen document type still gets sensible advice.
 */
const DOC_TIPS: { keywords: string[]; tipAr: string; tipEn: string }[] = [
  {
    keywords: ["إقامة"],
    tipAr: "صوّر بطاقة الإقامة من الوجهين على سطح مستوٍ بإضاءة جيدة، مع ظهور الزوايا الأربع كاملة ووضوح الاسم ورقم الإقامة.",
    tipEn: "Photograph both sides of the residence card on a flat, well-lit surface with all four corners visible and the name and Iqama number legible.",
  },
  {
    keywords: ["الهوية الوطنية", "الهوية", "هوية", "البطاقة"],
    tipAr: "صوّر بطاقة الهوية من الوجهين، مع ظهور الزوايا كاملة ووضوح رقم الهوية والصورة دون انعكاس ضوء.",
    tipEn: "Photograph the ID card on both sides with all corners visible and the ID number and photo clear, without glare.",
  },
  {
    keywords: ["جواز"],
    tipAr: "صوّر صفحة البيانات في جواز السفر (صفحة الصورة) كاملة داخل الإطار، دون تغطية أي جزء بإصبعك ودون انعكاس.",
    tipEn: "Photograph the passport data page (the photo page) fully within frame, without covering any part with your finger and without glare.",
  },
  {
    keywords: ["صورة شخصية"],
    tipAr: "أرفق صورة شخصية حديثة بخلفية بيضاء وواضحة الملامح، دون نظارة شمسية أو غطاء يحجب الوجه.",
    tipEn: "Attach a recent personal photo on a white background, face clearly visible, without sunglasses or anything covering the face.",
  },
  {
    keywords: ["عقد", "اتفاقية"],
    tipAr: "أرفق جميع صفحات العقد (يُفضّل ملف PDF)، مع ظهور صفحات التوقيع والأختام بوضوح — لا تكتفِ بالصفحة الأولى.",
    tipEn: "Attach every page of the contract (a PDF is best), with the signature and stamp pages clearly visible — don't send only the first page.",
  },
  {
    keywords: ["صك"],
    tipAr: "أرفق صك الملكية بكامل صفحاته مع ظهور الختم ورقم الصك بوضوح.",
    tipEn: "Attach all pages of the title deed with the seal and deed number clearly visible.",
  },
  {
    keywords: ["استمارة", "المركبة"],
    tipAr: "صوّر استمارة المركبة من الوجهين مع وضوح رقم اللوحة ورقم الهيكل وتاريخ الانتهاء.",
    tipEn: "Photograph the vehicle registration on both sides with the plate number, chassis number and expiry date legible.",
  },
  {
    keywords: ["رخصة"],
    tipAr: "صوّر الرخصة من الوجهين مع وضوح الاسم ورقمها وتاريخ انتهائها.",
    tipEn: "Photograph the license on both sides with the name, number and expiry date legible.",
  },
  {
    keywords: ["السجل التجاري", "سجل تجاري"],
    tipAr: "أرفق السجل التجاري كاملاً مع ظهور رقم السجل والنشاط وتاريخ الانتهاء بوضوح.",
    tipEn: "Attach the full commercial registration with the CR number, activity and expiry date clearly visible.",
  },
  {
    keywords: ["قوائم مالية", "القوائم المالية", "كشف", "رواتب", "الدرجات", "ضريبي", "الضريبية"],
    tipAr: "أرفق المستند بكامل صفحاته (يُفضّل PDF) مع وضوح الأرقام والتواريخ.",
    tipEn: "Attach the full document (PDF preferred) with all figures and dates legible.",
  },
  {
    keywords: ["موافقة", "تعهد", "إخلاء طرف", "إذن", "إثبات إنهاء الخدمة"],
    tipAr: "تأكد أن المستند موقّع ومختوم من الجهة المعنية، وأرفقه واضحاً بكامل صفحاته.",
    tipEn: "Make sure the document is signed and stamped by the relevant party, and attach it clearly with all its pages.",
  },
  {
    keywords: ["تقرير", "المستشفى", "طبي", "الفحص", "فحص"],
    tipAr: "أرفق التقرير على ورق الجهة الرسمي مع ظهور الختم والتاريخ واسم الجهة/الطبيب.",
    tipEn: "Attach the report on the official letterhead with the stamp, date and issuing party/doctor's name visible.",
  },
  {
    keywords: ["شهادة", "شهادات", "سجل التطعيم", "التطعيم"],
    tipAr: "صوّر الشهادة كاملة داخل الإطار مع ظهور الختم الرسمي والتاريخ بوضوح.",
    tipEn: "Photograph the whole certificate within frame with the official seal and date clearly visible.",
  },
  {
    keywords: ["العنوان الوطني", "العنوان"],
    tipAr: "أرفق إثبات العنوان الوطني الحديث كما يظهر في أبشر أو بريد السعودية.",
    tipEn: "Attach a recent national address proof as shown in Absher or Saudi Post.",
  },
  {
    keywords: ["المخطط", "الهندسي"],
    tipAr: "أرفق المخطط الهندسي المعتمد كاملاً مع ظهور ختم الاعتماد.",
    tipEn: "Attach the full approved engineering plan with the approval stamp visible.",
  },
  {
    keywords: ["خطة العمل", "التأسيس", "رأس المال"],
    tipAr: "أرفق المستند بصيغة PDF بكامل صفحاته وواضح القراءة.",
    tipEn: "Attach the document as a full, legible PDF.",
  },
  {
    keywords: ["ترجمة"],
    tipAr: "أرفق الترجمة المعتمدة مع ظهور ختم المترجم المعتمد وتوقيعه.",
    tipEn: "Attach the certified translation with the certified translator's stamp and signature visible.",
  },
];

/** Best-matching capture tip for a document type, with a safe generic default. */
function docTip(docType: string, lang: Lang): string {
  const found = DOC_TIPS.find((t) => t.keywords.some((k) => docType.includes(k)));
  if (found) return lang === "en" ? found.tipEn : found.tipAr;
  return lang === "en"
    ? "Make sure the file is clear, fully framed and readable."
    : "تأكد أن الملف واضح وكامل الحواف ومقروء.";
}

/**
 * The core derivation. Order of checks IS the customer's priority: pay first,
 * then fix anything rejected, then upload what's missing, then it's on us.
 */
export function computeGuidedState(op: OperationLike): GuidedState {
  const guide = SERVICE_GUIDES[op.service.code];
  const portalAr = guide?.portalAr ?? GENERIC_PORTAL_AR;
  const portalEn = guide?.portalEn ?? GENERIC_PORTAL_EN;

  const total = Math.max(op.steps.length, 1);
  const done = op.steps.filter((s) => s.status === "DONE").length;
  const progress = { done, total, percent: Math.min(100, Math.round((done / total) * 100)) };

  if (op.status === "CANCELLED") {
    return { phase: "CANCELLED", action: null, behindCurtain: null, progress };
  }

  // 1) Unpaid → the only thing on the customer is to pay.
  if (!op.feePaid) {
    return {
      phase: "PAY",
      action: {
        kind: "PAYMENT",
        titleAr: "سدّد رسوم الخدمة لبدء التنفيذ",
        titleEn: "Pay the service fee to begin",
        instructionsAr:
          "اضغط زر الدفع لتأكيد رسوم ميسوور. بمجرد الدفع نبدأ إجراءك فوراً ونطلب منك أول مستند مطلوب — لا تحتاج لمعرفة بقية الخطوات، نتكفّل نحن بها.",
        instructionsEn:
          "Press pay to confirm the Mysorat fee. Once paid we start immediately and ask you for the first required document — you don't need to know the rest of the steps, we handle them.",
      },
      behindCurtain: null,
      progress,
    };
  }

  // 2) A rejected document is the highest-priority customer action.
  const rejected = op.documents.find((d) => d.status === "REJECTED");
  if (rejected) {
    return {
      phase: "FIX_REJECTED",
      action: {
        kind: "DOCUMENT",
        docId: rejected.id,
        docType: rejected.docType,
        titleAr: `أعد رفع: ${rejected.docType}`,
        titleEn: `Re-upload: ${rejected.docType}`,
        instructionsAr: `الملف السابق لم يُقبل${
          rejected.verificationNote ? ` (${rejected.verificationNote})` : ""
        }. ${docTip(rejected.docType, "ar")} أعد رفع "${rejected.docType}" — هذا كل المطلوب منك الآن.`,
        instructionsEn: `The previous file was not accepted${
          rejected.verificationNote ? ` (${rejected.verificationNote})` : ""
        }. ${docTip(rejected.docType, "en")} Re-upload "${rejected.docType}" — that's all we need from you now.`,
      },
      behindCurtain: null,
      progress,
    };
  }

  // 3) Show only the FIRST not-yet-uploaded document - one task at a time.
  const pending = op.documents.find((d) => d.status === "PENDING");
  if (pending) {
    return {
      phase: "UPLOAD",
      action: {
        kind: "DOCUMENT",
        docId: pending.id,
        docType: pending.docType,
        titleAr: `ارفع الآن: ${pending.docType}`,
        titleEn: `Upload now: ${pending.docType}`,
        instructionsAr: `المطلوب منك الآن: أرفق "${pending.docType}". ${docTip(pending.docType, "ar")} هذا هو الإجراء الوحيد المطلوب منك حالياً — الباقي علينا.`,
        instructionsEn: `What we need from you now: attach "${pending.docType}". ${docTip(pending.docType, "en")} This is the only action required from you right now — the rest is on us.`,
      },
      behindCurtain: null,
      progress,
    };
  }

  // 4) All uploaded, something still under review → nothing for them to do.
  if (op.documents.some((d) => d.status === "UPLOADED")) {
    return {
      phase: "UNDER_REVIEW",
      action: null,
      behindCurtain: {
        messageAr: "نراجع الآن مستنداتك للتأكد من مطابقتها. لا يلزمك فعل شيء — سننبّهك فوراً إذا احتجنا أي تعديل.",
        messageEn: "We're reviewing your documents to make sure they match. Nothing for you to do — we'll alert you at once if anything needs fixing.",
        expectedDays: 1,
      },
      progress,
    };
  }

  // 5) Documents settled but the procedure isn't finished → it's with us/the agency.
  if (done < total) {
    return {
      phase: "PROCESSING",
      action: null,
      behindCurtain: {
        messageAr:
          guide?.processingAr ??
          `نعالج الآن إجراءك عبر ${portalAr}. لا يلزمك فعل شيء — سننبّهك عند اكتماله.`,
        messageEn:
          guide?.processingEn ??
          `We're now processing your request via ${portalEn}. Nothing for you to do — we'll notify you when it's done.`,
        expectedDays: guide?.processingDays,
      },
      progress,
    };
  }

  // 6) Everything finished.
  return { phase: "DONE", action: null, behindCurtain: null, progress };
}

const GUIDE_SYSTEM_AR = `أنت "مرشد ميسوور"، مساعد بشري الطابع يعين عملاء منصة خدمات حكومية سعودية.
مبدؤك مثل الطبيب: تعطي العميل ما يجب أن يفعله الآن فقط، بخطوات عملية موجزة وواضحة، دون إغراقه بكامل الإجراء البيروقراطي.
ركّز حصراً على حل العقبة الحالية التي يواجهها العميل في المهمة المطلوبة منه الآن (رفع مستند، دفع، خطوة على بوابة حكومية).
إن أرفق صورة شاشة، حلّلها واذكر بدقة أين يضغط أو ما الخطأ الظاهر وكيف يتجاوزه.
اكتب بالعربية، بنبرة مطمئنة ومحترمة، في نقاط قصيرة (٢–٥ نقاط بحد أقصى).
لا تَعِد بتنفيذ إجراء حكومي نيابةً عنه، ولا تطلب منه كلمات مرور أو رموز تحقق (OTP) أبداً.
إن كانت المشكلة خارج قدرتك أو تحتاج تدخلاً بشرياً، انصحه بوضوح بطلب تحويل العملية إلى مختص بشري عبر المنصة.`;

const GUIDE_SYSTEM_EN = `You are "Mysorat Guide", a human-like assistant helping customers of a Saudi government-services platform.
Your principle is a doctor's: give the customer only what they must do right now, in short practical steps, without drowning them in the whole bureaucratic procedure.
Focus solely on solving the customer's current obstacle in the task now required of them (uploading a document, paying, a step on a government portal).
If they attach a screenshot, analyse it and say precisely where to click or what the visible error is and how to get past it.
Write in English, reassuring and respectful, in short bullet points (2-5 max).
Never promise to perform a government action on their behalf, and never ask them for passwords or one-time codes (OTP).
If the issue is beyond you or needs a human, clearly advise them to request escalating the operation to a human specialist through the platform.`;

/**
 * The "I'm stuck" path - the feature that earns the fee. Takes the customer's
 * plain-language problem plus an optional screenshot and returns tailored,
 * scoped guidance for the current task only. Reuses the same vision-capable
 * model already used for document checks.
 */
export async function guideStuckCustomer(params: {
  language?: Lang;
  serviceNameAr: string;
  serviceNameEn: string;
  currentTaskAr: string;
  userMessage: string;
  image?: { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };
}): Promise<string> {
  if (!env.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY غير معرّف في متغيرات البيئة");
  }
  const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
  const language: Lang = params.language === "en" ? "en" : "ar";

  const contextText =
    language === "en"
      ? `Service: ${params.serviceNameEn || params.serviceNameAr}\nThe task currently required from the customer: ${params.currentTaskAr}\nThe customer describes their problem: ${params.userMessage}\nGuide the customer with brief practical steps to solve only what they face right now.`
      : `الخدمة: ${params.serviceNameAr}\nالمهمة المطلوبة من العميل الآن: ${params.currentTaskAr}\nوصف العميل لمشكلته: ${params.userMessage}\nأرشد العميل بخطوات عملية موجزة لحل ما يواجهه الآن فقط.`;

  const userContent = params.image
    ? ([
        { type: "image", source: { type: "base64", media_type: params.image.mediaType, data: params.image.base64 } },
        { type: "text", text: contextText },
      ] as const)
    : ([{ type: "text", text: contextText }] as const);

  const response = await anthropic.messages.create({
    model: env.claudeModel,
    max_tokens: 700,
    system: language === "en" ? GUIDE_SYSTEM_EN : GUIDE_SYSTEM_AR,
    messages: [{ role: "user", content: userContent as unknown as Anthropic.MessageParam["content"] }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const guidance = textBlock && "text" in textBlock ? textBlock.text.trim() : "";
  if (guidance) return guidance;
  return language === "en"
    ? "I couldn't generate guidance right now. Please request escalating this operation to a human specialist."
    : "لم أتمكن من توليد إرشاد الآن. الرجاء طلب تحويل العملية إلى مختص بشري.";
}
