import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../lib/api";
import { useAuthStore } from "../store/auth";

// «انشر طلبك» - مدخل السوق المباشر (آلية inDrive): اختر الخدمة، صف حاجتك،
// حدّد ميزانيتك، وستصلك عروض مقدمي الخدمة على شاشة المفاضلة.

interface CatalogService {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  descriptionAr?: string | null;
  platformFeeSar: string;
  estimatedDays: number;
}

export default function NewRequest() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "ar";
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuthStore();

  const [serviceId, setServiceId] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const { data } = useQuery({
    queryKey: ["services-catalog"],
    queryFn: async () => (await api.get("/services")).data as { services: CatalogService[] },
  });
  const services = data?.services ?? [];

  const grouped = useMemo(() => {
    const map = new Map<string, CatalogService[]>();
    for (const s of services) {
      map.set(s.category, [...(map.get(s.category) ?? []), s]);
    }
    return [...map.entries()];
  }, [services]);

  const selected = services.find((s) => s.id === serviceId);

  // اختيار مبدئي من ?cat= (بطاقات الفئات في الرئيسية)
  useEffect(() => {
    if (serviceId || services.length === 0) return;
    const cat = params.get("cat");
    const first = (cat && services.find((s) => s.category === cat)) || services[0];
    setServiceId(first.id);
  }, [services, params, serviceId]);

  // الميزانية المقترحة تتبع الخدمة المختارة ما لم يكتب العميل رقمه
  useEffect(() => {
    if (selected) setPrice(String(Math.round(Number(selected.platformFeeSar))));
  }, [serviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await api.post("/operations", {
        serviceId,
        description,
        targetPriceSar: Number(price),
      });
      navigate(`/operations/${res.data.operation.id}/bids`);
    } catch (err) {
      setError(apiErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-extrabold">{t("newRequest.title")}</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("newRequest.subtitle")}</p>

      <div className="card mt-6 flex flex-col gap-5 p-6">
        <div>
          <label className="mb-1.5 block text-sm font-bold" htmlFor="nr-service">
            {t("newRequest.service")}
          </label>
          <select
            id="nr-service"
            className="input"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
          >
            {grouped.map(([cat, list]) => (
              <optgroup key={cat} label={cat}>
                {list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {lang === "en" && s.nameEn ? s.nameEn : s.nameAr}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {selected?.descriptionAr && (
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{selected.descriptionAr}</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-bold" htmlFor="nr-desc">
            {t("newRequest.description")}
          </label>
          <textarea
            id="nr-desc"
            className="input min-h-28"
            placeholder={t("newRequest.descriptionPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-bold" htmlFor="nr-price">
            {t("newRequest.budget")}
          </label>
          <input
            id="nr-price"
            type="number"
            min={1}
            dir="ltr"
            className="input w-40"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{t("newRequest.budgetHint")}</p>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          className="btn-primary text-lg"
          disabled={busy || !serviceId || description.trim().length < 10 || !price}
          onClick={submit}
        >
          {t("newRequest.submit")}
        </button>
        {description.trim().length > 0 && description.trim().length < 10 && (
          <p className="text-xs text-slate-500">{t("newRequest.minDescription")}</p>
        )}
        {user?.role === "EXPERT" && <p className="text-xs text-red-500">{t("newRequest.expertBlocked")}</p>}
      </div>
    </main>
  );
}
