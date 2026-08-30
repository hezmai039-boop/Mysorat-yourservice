import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../lib/api";
import { useAuthStore } from "../store/auth";

// لوحة اعتماد مقدمي الخدمة - تظهر للمالك أعلى لوحة الإدارة:
// بوابة الثقة الوحيدة لدخول السوق (الاعتماد يفعّل الرادار فوراً).

interface AdminExpert {
  id: string;
  specialty: string | null;
  active: boolean;
  user: { email: string; phone: string | null };
  _count: { operations: number };
}

export function PendingProviders() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const { data } = useQuery({
    queryKey: ["admin-experts"],
    queryFn: async () => (await api.get("/admin/experts")).data as { experts: AdminExpert[] },
    enabled: user?.role === "OWNER",
  });

  if (user?.role !== "OWNER") return null;
  const pending = (data?.experts ?? []).filter((e) => !e.active);
  if (pending.length === 0) return null;

  async function setActive(id: string, active: boolean) {
    setBusyId(id);
    setError("");
    try {
      await api.patch(`/admin/experts/${id}`, { active });
      queryClient.invalidateQueries({ queryKey: ["admin-experts"] });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="card mx-auto mb-6 w-full max-w-5xl border-brand/50 p-5">
      <h2 className="font-extrabold">
        {t("adminProviders.title", { count: pending.length })}
      </h2>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      <ul className="mt-3 flex flex-col gap-2">
        {pending.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-white/10 px-4 py-3">
            <div className="min-w-0">
              <p className="font-bold" dir="ltr">{e.user.email}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {e.specialty ?? t("adminProviders.noSpecialty")}
              </p>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary !px-4 !py-2 text-sm" disabled={busyId === e.id} onClick={() => setActive(e.id, true)}>
                {t("adminProviders.approve")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
