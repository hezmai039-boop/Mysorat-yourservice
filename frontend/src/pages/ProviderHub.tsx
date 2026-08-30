import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../lib/api";
import { useAuthStore } from "../store/auth";

// بوابة «مقدم خدمة»: انضمام ذاتي بتخصص، ثم شاشة «قيد المراجعة» حتى يعتمدك
// المالك من لوحة الإدارة، وبعدها رادار سوق الطلبات مباشرة.

interface MyExpert {
  id: string;
  specialty: string | null;
  active: boolean;
}

export default function ProviderHub() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { token, user, setAuth } = useAuthStore();

  const [showForm, setShowForm] = useState(false);
  const [specialty, setSpecialty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["provider-me"],
    queryFn: async () => (await api.get("/providers/me")).data as { expert: MyExpert | null },
    enabled: !!token,
  });
  const expert = data?.expert ?? null;

  async function apply() {
    setBusy(true);
    setError("");
    try {
      const res = await api.post("/providers/apply", { specialty });
      // الدور تغيّر إلى EXPERT - نحدّث الجلسة بالرمز الجديد فوراً
      if (res.data.token && user) setAuth(res.data.token, { ...user, role: "EXPERT" });
      queryClient.invalidateQueries({ queryKey: ["provider-me"] });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const shellIcon = (
    <svg viewBox="0 0 24 24" className="mx-auto h-12 w-12 text-brand" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16v13H4zM9 7V4h6v3M4 13h16" />
    </svg>
  );

  // زائر غير مسجل
  if (!token) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-16 text-center">
        {shellIcon}
        <h1 className="mt-4 text-2xl font-extrabold">{t("providerHub.title")}</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("providerHub.subtitle")}</p>
        <Link to="/register" className="btn-primary mt-6 inline-flex">{t("providerHub.registerFirst")}</Link>
      </main>
    );
  }

  if (isLoading) {
    return <main className="mx-auto w-full max-w-md flex-1 px-4 py-16 text-center text-slate-500">…</main>;
  }

  // معتمد → إلى الرادار
  if (expert?.active) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-16 text-center">
        {shellIcon}
        <h1 className="mt-4 text-2xl font-extrabold">{t("providerHub.approvedTitle")}</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {t("providerHub.approvedDesc", { specialty: expert.specialty ?? "" })}
        </p>
        <button className="btn-primary mt-6" onClick={() => navigate("/market")}>
          {t("providerHub.goToMarket")}
        </button>
      </main>
    );
  }

  // قدّم وينتظر الاعتماد
  if (expert) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-16 text-center">
        {shellIcon}
        <h1 className="mt-4 text-2xl font-extrabold">{t("providerHub.pendingTitle")}</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("providerHub.pendingDesc")}</p>
      </main>
    );
  }

  // لم ينضم بعد
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-16 text-center">
      {shellIcon}
      <h1 className="mt-4 text-2xl font-extrabold">{t("providerHub.title")}</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("providerHub.subtitle")}</p>

      {!showForm ? (
        <button className="btn-primary mt-6" onClick={() => setShowForm(true)}>
          {t("providerHub.createProfile")}
        </button>
      ) : (
        <div className="card mt-6 flex flex-col gap-4 p-6 text-start">
          <div>
            <label className="mb-1.5 block text-sm font-bold" htmlFor="ph-specialty">
              {t("providerHub.specialty")}
            </label>
            <input
              id="ph-specialty"
              className="input"
              placeholder={t("providerHub.specialtyPlaceholder")}
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("providerHub.roleNote")}</p>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button className="btn-primary" disabled={busy || specialty.trim().length < 3} onClick={apply}>
            {t("providerHub.submit")}
          </button>
        </div>
      )}
    </main>
  );
}
