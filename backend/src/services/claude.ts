import Anthropic from "@anthropic-ai/sdk";
import { env } from "../lib/env";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!env.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY غير معرّف في متغيرات البيئة");
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.anthropicApiKey });
  }
  return client;
}

export interface DiagnosisResult {
  serviceCode: string | null;
  confidence: number;
  replyToUser: string;
  needsClarification: boolean;
}

export interface DocumentVerificationResult {
  verified: boolean;
  reason: string;
}

const DOCUMENT_VERIFICATION_SYSTEM_PROMPT = `أنت مدقق مستندات في منصة "ميسوور" للخدمات الحكومية السعودية.
مهمتك: التحقق مما إذا كان الملف المرفق يمكن أن يكون فعلياً من نوع المستند المطلوب - تحقق منطقي عام وليس تدقيقاً حرفياً دقيقاً للبيانات.
اقبل الملف إذا كان يبدو منطقياً كوثيقة رسمية أو مستند من نفس الفئة المطلوبة (حتى لو كانت جودة التصوير متوسطة أو الإضاءة غير مثالية أو بعض التفاصيل غير واضحة).
ارفض الملف فقط إذا كان بشكل واضح لا علاقة له إطلاقاً بنوع المستند المطلوب (مثل صورة طبيعة، حيوان، شخص عشوائي، منتج، لقطة شاشة لتطبيق آخر، أو ملف فارغ/غير مقروء تماماً).
عند الشك في حالة غير واضحة تماماً، اقبل الملف وارفع الأمر للمراجعة البشرية بدلاً من الرفض التلقائي الخاطئ.
أجب دائماً بصيغة JSON فقط بدون أي نص إضافي، بالشكل التالي:
{"verified": <true أو false>, "reason": "<سبب مختصر وواضح بالعربية يوضح القرار>"}`;

/**
 * Loose plausibility check, not OCR-grade validation - it exists to catch the
 * "uploaded a random unrelated photo" case, not to verify document authenticity
 * or field-level accuracy. Throws on API failure so callers can decide how to
 * degrade (the alternative - silently marking unverified content as accepted -
 * would defeat the point of calling this at all).
 */
export async function verifyDocument(params: {
  docTypeAr: string;
  file: { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf" };
}): Promise<DocumentVerificationResult> {
  const anthropic = getClient();

  const fileBlock =
    params.file.mediaType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: params.file.base64 } } as const)
      : ({ type: "image", source: { type: "base64", media_type: params.file.mediaType, data: params.file.base64 } } as const);

  const response = await anthropic.messages.create({
    model: env.claudeModel,
    max_tokens: 300,
    system: DOCUMENT_VERIFICATION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [fileBlock, { type: "text", text: `المستند المطلوب: "${params.docTypeAr}". هل هذا الملف يمكن أن يكون هذا المستند؟` }],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    return {
      verified: Boolean(parsed.verified ?? false),
      reason: parsed.reason ?? "تعذّر تحديد سبب واضح",
    };
  } catch {
    return { verified: false, reason: "تعذّر تفسير نتيجة الفحص التلقائي" };
  }
}

const SYSTEM_PROMPT = `أنت "ميسوور"، مستشار رقمي ذكي متخصص في الخدمات الحكومية السعودية.
مهمتك: تشخيص حاجة المستخدم وتحديد الخدمة الحكومية المناسبة من القائمة المتاحة فقط.
تحدث بأسلوب ودود ومباشر بدون شرح تقني أو الكشف عن آلية العمل الداخلية.
لا تشرح كيف تعمل الأنظمة الحكومية، فقط وجّه العميل للخطوة التالية.
أجب دائماً بصيغة JSON فقط بدون أي نص إضافي، بالشكل التالي:
{"serviceCode": "<كود الخدمة أو null>", "confidence": <رقم من 0 إلى 1>, "replyToUser": "<رد مختصر وودود بالعربية>", "needsClarification": <true أو false>}`;

export async function diagnoseServiceRequest(params: {
  userMessage: string;
  availableServices: { code: string; nameAr: string; category: string }[];
  history: { role: "user" | "assistant"; content: string }[];
  image?: { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };
}): Promise<DiagnosisResult> {
  const anthropic = getClient();

  const catalogText = params.availableServices
    .map((s) => `- ${s.code}: ${s.nameAr} (${s.category})`)
    .join("\n");

  const userContent: Anthropic.MessageParam["content"] = params.image
    ? [
        { type: "image", source: { type: "base64", media_type: params.image.mediaType, data: params.image.base64 } },
        { type: "text", text: params.userMessage || "حلل هذه الصورة وحدد الخدمة الحكومية المطلوبة." },
      ]
    : params.userMessage;

  // The breakpoint on the catalog block caches it together with SYSTEM_PROMPT
  // (prompt caching is a prefix match), so both are billed once and reused
  // across every user's request until a service is added/removed.
  const historyMessages: Anthropic.MessageParam[] = params.history.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const lastHistoryMessage = historyMessages[historyMessages.length - 1];
  if (lastHistoryMessage) {
    // Marks the end of the reusable prefix so a growing conversation reuses
    // its earlier turns from cache instead of rebilling them every message.
    lastHistoryMessage.content = [
      { type: "text", text: lastHistoryMessage.content as string, cache_control: { type: "ephemeral" } },
    ];
  }

  const response = await anthropic.messages.create({
    model: env.claudeModel,
    max_tokens: 500,
    system: [
      { type: "text", text: SYSTEM_PROMPT },
      { type: "text", text: `قائمة الخدمات المتاحة:\n${catalogText}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [...historyMessages, { role: "user" as const, content: userContent }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    return {
      serviceCode: parsed.serviceCode ?? null,
      confidence: Number(parsed.confidence ?? 0),
      replyToUser: parsed.replyToUser ?? "تفضل، كيف أقدر أخدمك؟",
      needsClarification: Boolean(parsed.needsClarification ?? true),
    };
  } catch {
    return {
      serviceCode: null,
      confidence: 0,
      replyToUser: raw.slice(0, 500) || "ممكن توضح طلبك أكثر؟",
      needsClarification: true,
    };
  }
}
