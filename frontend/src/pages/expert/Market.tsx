import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../../lib/api";
import { MarketOperation } from "../../types";
import { localizeCategory } from "../../i18n/serviceCategories";

// رادار الخبير (آلية inDrive): الطلبات المفتوحة تصل بالاستطلاع كل 5 ثوانٍ،
// والخبير يقبل سعر العميل بنقرة أو يقدم عرضاً مضاداً بسعره ومدة تسليمه.

export default function Market() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "ar";
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, { price: string; days: string; note: string }>>({});
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const { data } = useQuery({
    queryKey: ["market-open"],
    queryFn: async () =>
      (await api.get("/market/open")).data as { commissionRate: number; operations: MarketOperation[] },
    refetchInterval: 5000,
  });
  const rate = data?.commissionRate ?? 0.1;
  const net = (price: number) => Math.round(price * (1 - rate) * 100) / 100;

  function draft(id: string) {
    return drafts[id] ?? { price: "", days: "", note: "" };
  }

  function setDraft(id: string, patch: Partial<{ price: string; days: string; note: string }>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...draft(id), ...patch } }));
  }

  async function placeBid(op: MarketOperation, priceSar: number) {
    setBusyId(op.id);
    setMessage("");
    setError("");
    const d = draft(op.id);
    try {
      await api.post(`/market/operations/${op.id}/bids`, {
        priceSar,
        ...(d.days ? { deliveryDays: Number(d.days) } : {}),
        ...(d.note ? { note: d.note } : {}),
      });
      setMessage(t("market.bidSent"));
      queryClient.invalidateQueries({ queryKey: ["market-open"] });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyId("");
    }
  }

  const operations = data?.operations ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-extrabold">{t("market.radarTitle")}</h1>
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
      </div>
      <p className="mt-1 text-sm text-slate-500">{t("market.radarSubtitle")}</p>

      {message && <p className="mt-3 text-sm text-green-600">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {operations.length === 0 && (
        <div className="card mt-4 p-8 text-center text-slate-500">{t("market.radarEmpty")}</div>
      )}

      <div className="mt-4 space-y-3">
        {operations.map((op) => {
          const d = draft(op.id);
          const serviceName = lang === "en" && op.service.nameEn ? op.service.nameEn : op.service.nameAr;
          return (
            <div key={op.id} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-bold">{serviceName}</p>
                  <p className="text-sm text-slate-500">{localizeCategory(op.service.category, lang)}</p>
                  {op.myBid && (
                    <span className="mt-1 inline-block rounded-full bg-brand/15 px-2 py-0.5 text-xs font-bold text-brand-dark dark:bg-brand/10 dark:text-brand">
                      {t("market.myBid", { price: op.myBid.priceSar })}
                    </span>
                  )}
                </div>
                <div className="shrink-0 text-center">
                  <p className="text-2xl font-extrabold tabular-nums">
                    {op.targetPriceSar} <span className="text-xs font-normal">{t("market.sar")}</span>
                  </p>
                  <p className="text-xs text-slate-500">{t("market.clientTarget")}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-2">
                <button
                  className="btn-primary !px-4 !py-2 text-sm"
                  disabled={busyId === op.id}
                  onClick={() => placeBid(op, op.targetPriceSar)}
                >
                  {t("market.acceptPrice", { price: op.targetPriceSar })}
                </button>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-500">{t("market.yourPrice")}</label>
                  <input
                    type="number"
                    min={1}
                    dir="ltr"
                    className="input w-28"
                    value={d.price}
                    onChange={(e) => setDraft(op.id, { price: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-500">{t("market.days")}</label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    dir="ltr"
                    className="input w-20"
                    value={d.days}
                    onChange={(e) => setDraft(op.id, { days: e.target.value })}
                  />
                </div>
                <input
                  className="input min-w-40 flex-1"
                  placeholder={t("market.noteOptional")}
                  value={d.note}
                  onChange={(e) => setDraft(op.id, { note: e.target.value })}
                />
                <button
                  className="btn-secondary !px-4 !py-2 text-sm"
                  disabled={busyId === op.id || !d.price}
                  onClick={() => placeBid(op, Number(d.price))}
                >
                  {op.myBid ? t("market.updateBid") : t("market.placeBid")}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {t("market.netPayout", {
                  percent: Math.round(rate * 100),
                  net: net(d.price ? Number(d.price) : op.targetPriceSar),
                })}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
