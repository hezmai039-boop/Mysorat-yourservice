import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../lib/api";

interface MeResponse {
  user: { email: string; twoFactorEnabled: boolean };
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
    </div>
  );
}
