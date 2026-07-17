import { env } from "./env";

/**
 * Sends transactional email via Resend's HTTP API when RESEND_API_KEY is set.
 * Without it, the message is logged instead of sent - safe for local dev and
 * for a fresh deploy before an email provider is wired up, but it means no
 * real user receives a reset link until RESEND_API_KEY is configured.
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  if (!env.resendApiKey) {
    // eslint-disable-next-line no-console
    console.log(`[بريد تجريبي - لم يُضبط RESEND_API_KEY] رابط إعادة تعيين كلمة المرور لـ ${to}: ${resetUrl}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.resendFromEmail,
      to,
      subject: "إعادة تعيين كلمة المرور - ميسوور",
      html: `
        <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.7">
          <p>تلقينا طلباً لإعادة تعيين كلمة مرور حسابك في ميسوور.</p>
          <p><a href="${resetUrl}" style="color:#11998e;font-weight:bold">اضغط هنا لإعادة تعيين كلمة المرور</a></p>
          <p style="color:#64748b;font-size:13px">هذا الرابط صالح لمدة 30 دقيقة فقط. إن لم تطلب ذلك، تجاهل هذه الرسالة.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`فشل إرسال بريد إعادة التعيين عبر Resend: ${response.status} ${body}`);
  }
}
