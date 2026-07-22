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
  SPONSORSHIP_TRANSFER: {
    portalAr: 'منصة "قوى" عبر النفاذ الوطني الموحّد',
    portalEn: 'the "Qiwa" portal via Nafath',
    processingAr: "نتابع الآن موافقة الكفيل الحالي ومعالجة الجوازات لإتمام نقل الكفالة",
    processingEn: "We are now following up the current sponsor's approval and Jawazat processing to complete the transfer",
    processingDays: 3,
  },
  IQAMA_RENEWAL: {
    portalAr: 'منصة "أبشر"',
    portalEn: 'the "Absher" portal',
    processingAr: "نعالج الآن تجديد الإقامة لدى الجوازات بعد اكتمال مستنداتك",
    processingEn: "We are now processing your Iqama renewal with Jawazat",
    processingDays: 2,
  },
  DRIVING_LICENSE_RENEWAL: {
    portalAr: 'منصة "أبشر" (خدمات المرور)',
    portalEn: 'the "Absher" portal (Traffic services)',
    processingAr: "نعالج الآن تجديد رخصتك لدى إدارة المرور",
    processingEn: "We are now processing your license renewal with the Traffic Department",
    processingDays: 2,
  },
  EXIT_REENTRY_VISA: {
    portalAr: 'منصة "أبشر"',
    portalEn: 'the "Absher" portal',
    processingAr: "نصدر الآن تأشيرة الخروج والعودة لدى الجوازات",
    processingEn: "We are now issuing your exit-reentry visa with Jawazat",
    processingDays: 1,
  },
};

const GENERIC_PORTAL_AR = "البوابة الحكومية الرسمية للخدمة";
const GENERIC_PORTAL_EN = "the official government portal for this service";

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
        }. جهّز صورة واضحة وكاملة الحواف من "${rejected.docType}" وأعد رفعها. هذا كل المطلوب منك الآن.`,
        instructionsEn: `The previous file was not accepted${
          rejected.verificationNote ? ` (${rejected.verificationNote})` : ""
        }. Prepare a clear, fully-framed photo of "${rejected.docType}" and re-upload it. That's all we need from you now.`,
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
        instructionsAr: `صوّر أو أرفق "${pending.docType}" وارفعه. تأكد أن الصورة واضحة وكاملة الحواف. هذا هو الإجراء الوحيد المطلوب منك حالياً — الباقي علينا.`,
        instructionsEn: `Take a photo of or attach "${pending.docType}" and upload it. Make sure it's clear and fully framed. This is the only action required from you right now — the rest is on us.`,
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
