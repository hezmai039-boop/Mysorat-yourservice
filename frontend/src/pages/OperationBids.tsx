import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../lib/api";
import { Bid } from "../types";

// شاشة المفاضلة الحية (آلية inDrive): عروض الخبراء تصل بالاستطلاع كل 5 ثوانٍ،
// والعميل يقارن بالسعر/التقييم/مدة التسليم ويقبل عرضاً واحداً يقفل الصفقة.

type SortKey = "price" | "rating" | "delivery";

interface BidsResponse {
  operationStatus: string;
  targetPriceSar: number;
  acceptedBidId: string | null;
  bids: Bid[];
}

export default function OperationBids() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sortBy, setSortBy] = useState<SortKey>("price");
  const [target, setTarget] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["market-bids", id],
    queryFn: async () => (await api.get(`/market/operations/${id}/bids`)).data as BidsResponse,
    refetchInterval: (q) => (q.state.data?.operationStatus === "BIDDING" ? 5000 : false),
  });

  const bidding = data?.operationStatus === "BIDDING";
  const sorted = useMemo(() => {
    const list = [...(data?.bids ?? [])];
    if (sortBy === "price") list.sort((a, b) => a.priceSar - b.priceSar);
    if (sortBy === "rating") list.sort((a, b) => (b.expert.ratingAvg ?? 0) - (a.expert.ratingAvg ?? 0));
    if (sortBy === "delivery") list.sort((a, b) => (a.deliveryDays ?? 999) - (b.deliveryDays ?? 999));
    return list;
  }, [data?.bids, sortBy]);

  async function updateTarget() {
    setError("");
    setMessage("");
    try {
      await api.post(`/market/operations/${id}/target`, { targetPriceSar: Number(target) });
      setMessage(t("market.targetUpdated"));
      queryClient.invalidateQueries({ queryKey: ["market-bids", id] });
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function accept(bidId: string) {
    setBusy(true);
    setError("");
    try {
      await api.post(`/market/operations/${id}/bids/${bidId}/accept`);
      navigate(`/operations/${id}`);
    } catch (err) {
      setError(apiErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">{t("market.bidsTitle")}</h1>
        {bidding && (
          <span className="inline-flex items-center gap-2 rounded-full bg-brand/15 px-3 py-1 text-sm font-bold text-brand-dark dark:bg-brand/10 dark:text-brand">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
            {t("operationStatus.BIDDING")}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">{t("market.bidsSubtitle")}</p>

      {data && !bidding && (
        <div className="card mt-4 border-green-300 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/40">
          <p className="font-bold text-green-800 dark:text-green-300">{t("market.dealLocked")}</p>
          <Link to={`/operations/${id}`} className="btn-primary mt-3 inline-block !px-4 !py-2">
            {t("market.goToPayment")}
          </Link>
        </div>
      )}

      {bidding && data && (
        <div className="card mt-4 flex flex-wrap items-end gap-3 p-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-500">{t("market.yourTarget")}</label>
            <input
              type="number"
              min={1}
              dir="ltr"
              className="input w-32"
              placeholder={String(data.targetPriceSar)}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
          <button className="btn-secondary !px-4 !py-2" disabled={!target} onClick={updateTarget}>
            {t("market.updateTarget")}
          </button>
          <div className="ms-auto flex gap-2">
            {(
              [
                ["price", t("market.sortPrice")],
                ["rating", t("market.sortRating")],
                ["delivery", t("market.sortDelivery")],
              ] as [SortKey, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                className={`${sortBy === k ? "btn-primary" : "btn-secondary"} !px-3 !py-1.5 text-sm`}
                onClick={() => setSortBy(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {message && <p className="mt-2 text-sm text-green-600">{message}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {bidding && sorted.length === 0 && (
        <div className="card mt-4 p-8 text-center text-slate-500">
          <span className="me-2 inline-block h-2 w-2 animate-pulse rounded-full bg-brand" />
          {t("market.waitingBids")}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {sorted.map((b) => {
          const isAccepted = b.id === data?.acceptedBidId;
          const withinTarget = data && b.priceSar <= data.targetPriceSar;
          return (
            <div
              key={b.id}
              className={`card p-4 ${isAccepted ? "border-brand ring-1 ring-brand" : ""}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-bold">{b.expert.displayName}</p>
                  <p className="text-sm text-slate-500">
                    {b.expert.specialty && <>{b.expert.specialty} · </>}
                    ★ {b.expert.ratingAvg?.toFixed(1) ?? "—"} ({b.expert.ratingCount}) ·{" "}
                    {t("market.completedOps", { count: b.expert.completedOps })}
                  </p>
                  {b.deliveryDays != null && (
                    <p className="text-sm text-slate-500">{t("market.deliveryIn", { count: b.deliveryDays })}</p>
                  )}
                  {b.note && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">«{b.note}»</p>}
                </div>
                <div className="shrink-0 text-center">
                  <p className="text-2xl font-extrabold tabular-nums">
                    {b.priceSar} <span className="text-xs font-normal">{t("market.sar")}</span>
                  </p>
                  {withinTarget && (
                    <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-bold text-brand-dark dark:bg-brand/10 dark:text-brand">
                      {t("market.withinTarget")}
                    </span>
                  )}
                </div>
              </div>
              {bidding && (
                <button className="btn-primary mt-3 !px-4 !py-2" disabled={busy} onClick={() => accept(b.id)}>
                  {t("market.acceptBid")}
                </button>
              )}
              {isAccepted && (
                <span className="mt-3 inline-block rounded-full bg-brand/15 px-3 py-1 text-sm font-bold text-brand-dark dark:bg-brand/10 dark:text-brand">
                  {t("market.acceptedBadge")}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
