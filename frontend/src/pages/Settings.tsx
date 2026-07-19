import { FormEvent, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../lib/api";
import { isPushSubscribed, subscribeToPush, unsubscribeFromPush } from "../lib/push";

interface MeResponse {
  user: {
    email: string;
    twoFactorEnabled: boolean;
    referralCode: string;
    creditSar: string;
    smsNotificationsEnabled: boolean;
    whatsappNotificationsEnabled: boolean;
    phone: string | null;
  };
}

export default function Settings() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/auth/me")).data as MeResponse,
  });

  const [setupData, setSetupData] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"idle" | "enabling" | "disabling">("idle");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  const [prefsBusy, setPrefsBusy] = useState(false);
  const [copiedReferral, setCopiedReferral] = useState(false);

  useEffect(() => {
    isPushSubscribed().then(setPushSubscribed);
  }, []);

  async function togglePush() {
    setPushError("");
    setPushBusy(true);
    try {
      if (pushSubscribed) {
        await unsubscribeFromPush();
        setPushSubscribed(false);
      } else {
        await subscribeToPush();
        setPushSubscribed(true);
      }
    } catch (err) {
      setPushError(err instanceof Error ? err.message : apiErrorMessage(err));
    } finally {
      setPushBusy(false);
    }
  }

  async function updateNotificationPref(field: "smsNotificationsEnabled" | "whatsappNotificationsEnabled", value: boolean) {
    setPrefsBusy(true);
    try {
      await api.patch("/auth/notification-preferences", { [field]: value });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } finally {
      setPrefsBusy(false);
    }
  }

  function copyReferralLink() {
    if (!data) return;
    const link = `${window.location.origin}/register?ref=${data.user.referralCode}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedReferral(true);
      setTimeout(() => setCopiedReferral(false), 2000);
    });
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (newPassword !== confirmNewPassword) {
      setPasswordError("كلمتا المرور الجديدتان غير متطابقتين");
      return;
    }

    setPasswordBusy(true);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      setPasswordSuccess("تم تحديث كلمة المرور بنجاح");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      setPasswordError(apiErrorMessage(err));
    } finally {
      setPasswordBusy(false);
    }
  }

  async function startSetup() {
    setError("");
    setBusy(true);
    try {
      const res = await api.post("/auth/2fa/setup");
      setSetupData(res.data);
      setMode("enabling");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/auth/2fa/enable", { token: code });
      setMode("idle");
      setSetupData(null);
      setCode("");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDisable(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/auth/2fa/disable", { token: code });
      setMode("idle");
      setCode("");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="text-center py-16 text-slate-500">جارِ التحميل...</p>;

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-bold mb-6">الإعدادات</h1>

      <div className="card p-6">
        <h2 className="font-bold mb-1">التحقق بخطوتين (2FA)</h2>
        <p className="text-sm text-slate-500 mb-4">
          طبقة حماية إضافية لحسابك عبر تطبيق مصادقة مثل Google Authenticator.
        </p>

        {error && <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{error}</p>}

        {mode === "idle" && (
          <>
            <p className="mb-4 text-sm">
              الحالة الحالية:{" "}
              <span className={data.user.twoFactorEnabled ? "text-green-600 font-semibold" : "text-slate-500"}>
                {data.user.twoFactorEnabled ? "مفعّل ✓" : "غير مفعّل"}
              </span>
            </p>
            {data.user.twoFactorEnabled ? (
              <button className="btn-secondary" onClick={() => setMode("disabling")}>إلغاء التفعيل</button>
            ) : (
              <button className="btn-primary" onClick={startSetup} disabled={busy}>تفعيل التحقق بخطوتين</button>
            )}
          </>
        )}

        {mode === "enabling" && setupData && (
          <form onSubmit={confirmEnable} className="flex flex-col gap-4">
            <p className="text-sm">امسح الرمز بتطبيق المصادقة، أو أدخل المفتاح يدوياً:</p>
            <img src={setupData.qrCodeDataUrl} alt="QR Code" className="mx-auto h-40 w-40 rounded-lg border" />
            <p className="text-center text-xs font-mono break-all text-slate-500">{setupData.secret}</p>
            <input
              className="input text-center tracking-widest text-lg"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
              required
            />
            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={busy || code.length !== 6}>تأكيد التفعيل</button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setMode("idle");
                  setSetupData(null);
                  setCode("");
                }}
              >
                إلغاء
              </button>
            </div>
          </form>
        )}

        {mode === "disabling" && (
          <form onSubmit={confirmDisable} className="flex flex-col gap-4">
            <p className="text-sm">أدخل رمز التحقق الحالي لإلغاء تفعيل الحماية بخطوتين:</p>
            <input
              className="input text-center tracking-widest text-lg"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
              required
            />
            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={busy || code.length !== 6}>تأكيد الإلغاء</button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setMode("idle");
                  setCode("");
                }}
              >
                تراجع
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card p-6 mt-6">
        <h2 className="font-bold mb-1">تغيير كلمة المرور</h2>
        <p className="text-sm text-slate-500 mb-4">حدّث كلمة مرور حسابك مباشرة من هنا.</p>

        {passwordError && <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{passwordError}</p>}
        {passwordSuccess && <p className="mb-4 rounded-lg bg-green-50 dark:bg-green-950 p-3 text-sm text-green-600">{passwordSuccess}</p>}

        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          <input
            className="input"
            type="password"
            placeholder="كلمة المرور الحالية"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="كلمة المرور الجديدة"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="تأكيد كلمة المرور الجديدة"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            minLength={8}
            required
          />
          <button className="btn-primary" disabled={passwordBusy}>
            {passwordBusy ? "جارِ التحديث..." : "تحديث كلمة المرور"}
          </button>
        </form>
      </div>

      <div className="card p-6 mt-6">
        <h2 className="font-bold mb-1">الإشعارات</h2>
        <p className="text-sm text-slate-500 mb-4">اختر كيف تريد أن نبقيك على اطّلاع بتحديثات معاملاتك.</p>

        {pushError && <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{pushError}</p>}

        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-semibold">إشعارات فورية (Push)</p>
            <p className="text-xs text-slate-500">تنبيهات مباشرة على جهازك حتى مع إغلاق المتصفح.</p>
          </div>
          <button className="btn-secondary !px-4 !py-2 text-xs" onClick={togglePush} disabled={pushBusy}>
            {pushSubscribed ? "إيقاف" : "تفعيل"}
          </button>
        </div>

        <div className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-slate-800 mt-2 pt-3">
          <div>
            <p className="text-sm font-semibold">رسائل SMS</p>
            <p className="text-xs text-slate-500">{data.user.phone ? `إلى ${data.user.phone}` : "أضف رقم جوال لتفعيلها"}</p>
          </div>
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={data.user.smsNotificationsEnabled}
            disabled={prefsBusy || !data.user.phone}
            onChange={(e) => updateNotificationPref("smsNotificationsEnabled", e.target.checked)}
          />
        </div>

        <div className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-slate-800 mt-2 pt-3">
          <div>
            <p className="text-sm font-semibold">واتساب</p>
            <p className="text-xs text-slate-500">{data.user.phone ? `إلى ${data.user.phone}` : "أضف رقم جوال لتفعيلها"}</p>
          </div>
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={data.user.whatsappNotificationsEnabled}
            disabled={prefsBusy || !data.user.phone}
            onChange={(e) => updateNotificationPref("whatsappNotificationsEnabled", e.target.checked)}
          />
        </div>
      </div>

      <div className="card p-6 mt-6">
        <h2 className="font-bold mb-1">ادعُ أصدقاءك واكسب رصيداً</h2>
        <p className="text-sm text-slate-500 mb-4">
          شارك رابط الإحالة الخاص بك، واحصل على 20 ريال رصيد عند أول عملية مدفوعة لكل صديق ينضم عبره.
        </p>
        <div className="flex items-center gap-2">
          <input className="input flex-1 text-xs font-mono" readOnly value={`${window.location.origin}/register?ref=${data.user.referralCode}`} />
          <button className="btn-secondary !px-4 text-xs" onClick={copyReferralLink}>{copiedReferral ? "تم النسخ ✓" : "نسخ"}</button>
        </div>
        <p className="text-sm mt-4">
          رصيدك الحالي: <span className="font-bold text-brand">{data.user.creditSar} ريال</span>
          <span className="text-xs text-slate-400"> (يُخصم تلقائياً من رسوم المنصة عند الدفع)</span>
        </p>
      </div>
    </div>
  );
}
