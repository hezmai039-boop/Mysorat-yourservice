import { FormEvent, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      setPasswordError(t("settings.passwordMismatch"));
      return;
    }

    setPasswordBusy(true);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      setPasswordSuccess(t("settings.passwordUpdated"));
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

  if (!data) return <p className="text-center py-16 text-slate-500">{t("common.loading")}</p>;

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-bold mb-6">{t("settings.title")}</h1>

      <div className="card p-6">
        <h2 className="font-bold mb-1">{t("settings.twoFactorTitle")}</h2>
        <p className="text-sm text-slate-500 mb-4">
          {t("settings.twoFactorDesc")}
        </p>

        {error && <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{error}</p>}

        {mode === "idle" && (
          <>
            <p className="mb-4 text-sm">
              {t("settings.currentStatus")}{" "}
              <span className={data.user.twoFactorEnabled ? "text-green-600 font-semibold" : "text-slate-500"}>
                {data.user.twoFactorEnabled ? t("settings.enabled") : t("settings.disabled")}
              </span>
            </p>
            {data.user.twoFactorEnabled ? (
              <button className="btn-secondary" onClick={() => setMode("disabling")}>{t("settings.disable2fa")}</button>
            ) : (
              <button className="btn-primary" onClick={startSetup} disabled={busy}>{t("settings.enable2fa")}</button>
            )}
          </>
        )}

        {mode === "enabling" && setupData && (
          <form onSubmit={confirmEnable} className="flex flex-col gap-4">
            <p className="text-sm">{t("settings.scanQr")}</p>
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
              <button className="btn-primary flex-1" disabled={busy || code.length !== 6}>{t("settings.confirmEnable")}</button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setMode("idle");
                  setSetupData(null);
                  setCode("");
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          </form>
        )}

        {mode === "disabling" && (
          <form onSubmit={confirmDisable} className="flex flex-col gap-4">
            <p className="text-sm">{t("settings.enterCodeToDisable")}</p>
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
              <button className="btn-primary flex-1" disabled={busy || code.length !== 6}>{t("settings.confirmDisable")}</button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setMode("idle");
                  setCode("");
                }}
              >
                {t("settings.goBack")}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card p-6 mt-6">
        <h2 className="font-bold mb-1">{t("settings.changePasswordTitle")}</h2>
        <p className="text-sm text-slate-500 mb-4">{t("settings.changePasswordDesc")}</p>

        {passwordError && <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{passwordError}</p>}
        {passwordSuccess && <p className="mb-4 rounded-lg bg-green-50 dark:bg-green-950 p-3 text-sm text-green-600">{passwordSuccess}</p>}

        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          <input
            className="input"
            type="password"
            placeholder={t("settings.currentPasswordPlaceholder")}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder={t("settings.newPasswordPlaceholder")}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
          <input
            className="input"
            type="password"
            placeholder={t("settings.confirmNewPasswordPlaceholder")}
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            minLength={8}
            required
          />
          <button className="btn-primary" disabled={passwordBusy}>
            {passwordBusy ? t("settings.updating") : t("settings.updatePassword")}
          </button>
        </form>
      </div>

      <div className="card p-6 mt-6">
        <h2 className="font-bold mb-1">{t("settings.notificationsTitle")}</h2>
        <p className="text-sm text-slate-500 mb-4">{t("settings.notificationsDesc")}</p>

        {pushError && <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{pushError}</p>}

        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-semibold">{t("settings.pushTitle")}</p>
            <p className="text-xs text-slate-500">{t("settings.pushDesc")}</p>
          </div>
          <button className="btn-secondary !px-4 !py-2 text-xs" onClick={togglePush} disabled={pushBusy}>
            {pushSubscribed ? t("settings.disable") : t("settings.enable")}
          </button>
        </div>

        <div className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-slate-800 mt-2 pt-3">
          <div>
            <p className="text-sm font-semibold">{t("settings.smsTitle")}</p>
            <p className="text-xs text-slate-500">{data.user.phone ? t("settings.toPhone", { phone: data.user.phone }) : t("settings.addPhoneToEnable")}</p>
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
            <p className="text-sm font-semibold">{t("settings.whatsappTitle")}</p>
            <p className="text-xs text-slate-500">{data.user.phone ? t("settings.toPhone", { phone: data.user.phone }) : t("settings.addPhoneToEnable")}</p>
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
        <h2 className="font-bold mb-1">{t("settings.referralTitle")}</h2>
        <p className="text-sm text-slate-500 mb-4">
          {t("settings.referralDesc")}
        </p>
        <div className="flex items-center gap-2">
          <input className="input flex-1 text-xs font-mono" readOnly value={`${window.location.origin}/register?ref=${data.user.referralCode}`} />
          <button className="btn-secondary !px-4 text-xs" onClick={copyReferralLink}>{copiedReferral ? t("settings.copied") : t("settings.copy")}</button>
        </div>
        <p className="text-sm mt-4">
          {t("settings.currentBalance")} <span className="font-bold text-brand">{t("settings.sarAmount", { amount: data.user.creditSar })}</span>
          <span className="text-xs text-slate-400"> {t("settings.balanceNote")}</span>
        </p>
      </div>
    </div>
  );
}
