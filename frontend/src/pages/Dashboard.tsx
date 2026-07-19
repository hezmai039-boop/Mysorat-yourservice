import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, apiErrorMessage } from "../lib/api";
import { useAuthStore } from "../store/auth";
import { Sidebar } from "../components/Sidebar";
import { Operation, Service } from "../types";
import { localizeCategory } from "../i18n/serviceCategories";

const PAGE_SIZE = 30;

const STATUS_COLORS: Record<string, string> = {
  PENDING_PAYMENT: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  DOCS_REQUIRED: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  IN_PROGRESS: "bg-brand/10 text-brand",
  DELAYED: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  ESCALATED_TO_EXPERT: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  COMPLETED: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  CANCELLED: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

function StatCard({ icon, label, value, tone }: { icon: string; label: string; value: string | number; tone: string }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xl font-extrabold tabular-nums">{value}</p>
        <p className="text-xs text-slate-500 truncate">{label}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "ar";
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [total, setTotal] = useState(0);

  function serviceName(s?: Service): string {
    if (!s) return "";
    return lang === "en" && s.nameEn ? s.nameEn : s.nameAr;
  }

  function recentUpdateText(op: Operation): string {
    const name = serviceName(op.service);
    if (op.delayed) return t("dashboard.updateDelayed", { name, reason: op.delayReason ? ` — ${op.delayReason}` : "" });
    if (op.status === "COMPLETED") return t("dashboard.updateCompleted", { name });
    if (op.status === "PENDING_PAYMENT") return t("dashboard.updatePendingPayment", { name });
    return t("dashboard.updateInProgress", { name });
  }

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["operations", page],
    queryFn: async () =>
      (await api.get("/operations", { params: { page, pageSize: PAGE_SIZE } })).data as {
        operations: Operation[];
        total: number;
      },
  });

  useEffect(() => {
    if (!data) return;
    setOperations((prev) => (page === 1 ? data.operations : [...prev, ...data.operations]));
    setTotal(data.total);
  }, [data, page]);

  const hasMore = operations.length < total;
  const isCustomer = user?.role === "INDIVIDUAL" || user?.role === "BUSINESS";
  const isExpert = user?.role === "EXPERT";

  const { data: favoritesData } = useQuery({
    queryKey: ["favorites"],
    queryFn: async () => (await api.get("/favorites")).data as { favorites: Service[] },
    enabled: isCustomer,
  });

  const pendingFeesSum = operations.filter((o) => !o.feePaid).reduce((sum, o) => sum + Number(o.feeAmountSar), 0);
  const completedCount = operations.filter((o) => o.status === "COMPLETED").length;
  const activeCount = operations.filter((o) => o.status !== "COMPLETED" && o.status !== "CANCELLED").length;
  const delayedCount = operations.filter((o) => o.delayed).length;
  const recentUpdates = operations.slice(0, 4);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 flex gap-6 items-start">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold">
              {isExpert ? t("dashboard.welcomeExpert", { email: user?.email }) : t("dashboard.welcome")}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {isExpert
                ? t("dashboard.expertSubtitle")
                : activeCount > 0
                ? t("dashboard.activeRequestsSubtitle", { count: activeCount })
                : t("dashboard.noActiveRequests")}
            </p>
          </div>
          {isCustomer && (
            <div className="flex gap-2">
              <Link to="/chat" className="btn-primary">{t("dashboard.newRequest")}</Link>
            </div>
          )}
        </div>

        {isCustomer && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <StatCard icon="💳" label={t("dashboard.pendingFees")} value={`${pendingFeesSum} ${t("dashboard.sar")}`} tone="bg-red-50 dark:bg-red-950/40" />
            <StatCard icon="⏳" label={t("dashboard.activeRequests")} value={activeCount} tone="bg-brand/10" />
            <StatCard icon="✓" label={t("dashboard.completedRequests")} value={completedCount} tone="bg-green-50 dark:bg-green-950/40" />
            <StatCard icon="⚠️" label={t("dashboard.delayedRequests")} value={delayedCount} tone="bg-orange-50 dark:bg-orange-950/40" />
          </div>
        )}

        {isLoading && operations.length === 0 && <p className="text-slate-500">{t("common.loading")}</p>}

        {isError && operations.length === 0 && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950 p-4 text-sm text-red-600">
            <p>{apiErrorMessage(error)}</p>
            <button className="btn-secondary !px-3 !py-1.5 text-xs mt-3" onClick={() => refetch()}>{t("dashboard.retry")}</button>
          </div>
        )}

        {!isLoading && !isError && operations.length === 0 && (
          <div className="card p-10 text-center">
            <p className="text-slate-500 mb-4">{t("dashboard.noOperationsYet")}</p>
            {isCustomer && <Link to="/chat" className="btn-primary">{t("dashboard.talkToMysoratNow")}</Link>}
          </div>
        )}

        {operations.length > 0 && (
          <>
            <h2 className="font-bold mb-3">{t("dashboard.trackCurrentRequests")}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {operations.map((op) => {
                const pct = op.totalSteps > 0 ? Math.round((op.currentStep / op.totalSteps) * 100) : 0;
                return (
                  <div key={op.id} className="card p-5">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-slate-400">{op.service?.category ? localizeCategory(op.service.category, lang) : ""}</p>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[op.status]}`}>
                        {t(`operationStatus.${op.status}`)}
                      </span>
                    </div>
                    <p className="font-semibold mb-3">{serviceName(op.service)}</p>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mb-2">
                      <div
                        className={`h-full rounded-full ${op.delayed ? "bg-orange-500" : "bg-brand"}`}
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 mb-3">{t("dashboard.progressLabel", { pct, current: op.currentStep, total: op.totalSteps })}</p>
                    <Link to={`/operations/${op.id}`} className="btn-secondary !py-2 text-xs w-full text-center">
                      {t("dashboard.viewRequestDetails")}
                    </Link>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-6">
                <button className="btn-secondary" disabled={isLoading} onClick={() => setPage((p) => p + 1)}>
                  {isLoading ? t("common.loading") : t("dashboard.loadMore")}
                </button>
              </div>
            )}
          </>
        )}

        {isCustomer && (recentUpdates.length > 0 || (favoritesData && favoritesData.favorites.length > 0)) && (
          <div className="grid gap-4 sm:grid-cols-2 mt-8">
            {recentUpdates.length > 0 && (
              <div className="card p-5">
                <h2 className="font-bold mb-3 text-sm">{t("dashboard.latestUpdates")}</h2>
                <div className="flex flex-col gap-3">
                  {recentUpdates.map((op) => (
                    <p key={op.id} className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed border-b border-slate-100 dark:border-slate-800 pb-2 last:border-0 last:pb-0">
                      {recentUpdateText(op)}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {favoritesData && favoritesData.favorites.length > 0 && (
              <div className="card p-5">
                <h2 className="font-bold mb-3 text-sm">{t("dashboard.favoriteServices")}</h2>
                <div className="flex flex-wrap gap-2">
                  {favoritesData.favorites.map((s) => (
                    <Link
                      key={s.id}
                      to="/chat"
                      className="rounded-full border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs hover:border-brand hover:text-brand transition"
                    >
                      ★ {serviceName(s)}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {isCustomer && (
          <div className="card mt-8 p-6 bg-gradient-to-l from-brand-dark to-brand text-white flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-bold">{t("dashboard.needHelpTitle")}</p>
              <p className="text-sm opacity-90 mt-1">{t("dashboard.needHelpDesc")}</p>
            </div>
            <Link to="/chat" className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-brand hover:opacity-90 transition">
              {t("dashboard.startChatNow")}
            </Link>
          </div>
        )}
      </div>

      <Sidebar />
    </div>
  );
}
