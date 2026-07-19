import twilio from "twilio";
import webpush from "web-push";
import * as Sentry from "@sentry/node";
import { env, twilioEnabled, webPushEnabled } from "../lib/env";
import { prisma } from "../lib/prisma";

let twilioClient: ReturnType<typeof twilio> | null = null;
function getTwilioClient() {
  if (!twilioClient) twilioClient = twilio(env.twilio.accountSid, env.twilio.authToken);
  return twilioClient;
}

let vapidConfigured = false;
function ensureVapidConfigured() {
  if (vapidConfigured) return;
  webpush.setVapidDetails(`mailto:${env.webPush.contactEmail}`, env.webPush.publicKey, env.webPush.privateKey);
  vapidConfigured = true;
}

/**
 * Logs instead of sending when TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN aren't
 * set - same fallback used for email in lib/mailer.ts - so a fresh deploy
 * never crashes on a missing provider, it just doesn't reach a real phone
 * until the credentials are configured.
 */
export async function sendSms(to: string, body: string): Promise<void> {
  if (!twilioEnabled || !env.twilio.fromSms) {
    // eslint-disable-next-line no-console
    console.log(`[SMS تجريبي - Twilio غير مُعد] إلى ${to}: ${body}`);
    return;
  }
  await getTwilioClient().messages.create({ body, from: env.twilio.fromSms, to });
}

export async function sendWhatsApp(to: string, body: string): Promise<void> {
  if (!twilioEnabled || !env.twilio.fromWhatsapp) {
    // eslint-disable-next-line no-console
    console.log(`[واتساب تجريبي - Twilio غير مُعد] إلى ${to}: ${body}`);
    return;
  }
  await getTwilioClient().messages.create({
    body,
    from: env.twilio.fromWhatsapp,
    to: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
  });
}

export async function sendPushToUser(userId: string, title: string, body: string): Promise<void> {
  if (!webPushEnabled) return;
  ensureVapidConfigured();

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({ title, body });
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err: any) {
        // 404/410 means the browser dropped the subscription (uninstalled,
        // cleared data) - stale rows would otherwise accumulate forever and
        // get retried on every future notification.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        } else {
          // eslint-disable-next-line no-console
          console.error("فشل إرسال إشعار Push", err);
          Sentry.captureException(err);
        }
      }
    })
  );
}

/**
 * Fans a status update out to every channel the user has actually opted
 * into/subscribed to - SMS and WhatsApp are opt-in flags on User, push is
 * opt-in by the mere existence of a subscription row. Never throws - a
 * notification failure must never fail the operation it's reporting on.
 */
export async function notifyUser(userId: string, message: { title: string; body: string }): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const jobs: Promise<void>[] = [];
    if (user.phone && user.smsNotificationsEnabled) jobs.push(sendSms(user.phone, message.body));
    if (user.phone && user.whatsappNotificationsEnabled) jobs.push(sendWhatsApp(user.phone, message.body));
    jobs.push(sendPushToUser(userId, message.title, message.body));

    await Promise.all(
      jobs.map((j) =>
        j.catch((err) => {
          // eslint-disable-next-line no-console
          console.error("فشل إرسال إشعار", err);
          Sentry.captureException(err);
        })
      )
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("فشل نظام الإشعارات", err);
    Sentry.captureException(err);
  }
}
