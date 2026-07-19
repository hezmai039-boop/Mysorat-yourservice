import { api } from "./api";

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0))).buffer;
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return !!subscription;
}

export async function subscribeToPush(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("المتصفح لا يدعم الإشعارات الفورية");
  }

  const { data } = await api.get("/push/vapid-public-key");
  if (!data.publicKey) {
    throw new Error("لم يتم تفعيل الإشعارات الفورية على الخادم بعد");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("تم رفض إذن الإشعارات من المتصفح");
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey),
  });

  await api.post("/push/subscribe", subscription.toJSON());
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await api.delete("/push/subscribe", { data: { endpoint: subscription.endpoint } });
  await subscription.unsubscribe();
}
