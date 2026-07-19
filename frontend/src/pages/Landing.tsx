import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Service, ServiceAudience } from "../types";
import { useAuthStore } from "../store/auth";
import { AmbientBackground } from "../components/AmbientBackground";
import { StatCounter } from "../components/StatCounter";

const AUDIENCE_FILTERS: { key: ServiceAudience | "ALL"; label: string }[] = [
  { key: "ALL", label: "الكل" },
  { key: "CITIZEN", label: "المواطن" },
  { key: "RESIDENT", label: "المقيم" },
  { key: "VISITOR", label: "الزائر" },
  { key: "BUSINESS", label: "الأعمال" },
];

const FEATURES = [
  {
    title: "محادثة ذكية بالعربية",
    desc: "صف طلبك بالصوت أو النص أو صورة، وميسوور يشخّص احتياجك فوراً.",
    icon: (
      <path d="M4 5h16a1 1 0 011 1v9a1 1 0 01-1 1H9l-4 4v-4H4a1 1 0 01-1-1V6a1 1 0 011-1z" />
    ),
  },
  {
    title: "خطوة بخطوة بدون تعقيد",
    desc: "لا شرح تقني، فقط توجيه مباشر حتى إنجاز الخدمة.",
    icon: (
      <>
        <circle cx="5" cy="12" r="2" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="2" fill="currentColor" stroke="none" />
        <path d="M7 12h3M14 12h3" />
      </>
    ),
  },
  {
    title: "تتبع لحظي",
    desc: "اعرف أين وصلت معاملتك وكم تبقى من الوقت.",
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l3 2" />
      </>
    ),
  },
  {
    title: "خبراء عند الحاجة",
    desc: "إذا تعثرت الأتمتة، يتولى خبير مختص إكمال إجراءك يدوياً.",
    icon: (
      <>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6" />
      </>
    ),
  },
];

export default function Landing() {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: feedbackData } = useQuery({
    queryKey: ["feedback-count"],
    queryFn: async () => (await api.get("/feedback/count")).data as { count: number; averageRating: number },
    retry: false,
  });

  const { data: servicesData } = useQuery({
    queryKey: ["services"],
    queryFn: async () => (await api.get("/services")).data as { services: Service[] },
    retry: false,
  });

  const { data: favoritesData } = useQuery({
    queryKey: ["favorites"],
    queryFn: async () => (await api.get("/favorites")).data as { favorites: Service[] },
    enabled: !!token,
    retry: false,
  });

  const { data: testimonialsData } = useQuery({
    queryKey: ["testimonials"],
    queryFn: async () =>
      (await api.get("/feedback/testimonials")).data as {
        testimonials: { id: string; rating: number; comment: string | null; serviceNameAr: string; displayName: string }[];
      },
    retry: false,
  });
  const favoriteIds = useMemo(() => new Set((favoritesData?.favorites ?? []).map((s) => s.id)), [favoritesData]);

  async function toggleFavorite(serviceId: string) {
    if (!token) return;
    try {
      if (favoriteIds.has(serviceId)) {
        await api.delete(`/favorites/${serviceId}`);
      } else {
        await api.post(`/favorites/${serviceId}`);
      }
      await queryClient.invalidateQueries({ queryKey: ["favorites"] });
    } catch {
      // Best-effort - a failed favorite toggle isn't worth interrupting the visitor with an error banner.
    }
  }

  const [audienceFilter, setAudienceFilter] = useState<ServiceAudience | "ALL">("ALL");
  const [search, setSearch] = useState("");

  const groupedServices = useMemo(() => {
    const services = servicesData?.services ?? [];
    const byAudience = audienceFilter === "ALL" ? services : services.filter((s) => s.targetAudience.includes(audienceFilter));
    const query = search.trim().toLowerCase();
    const filtered = query
      ? byAudience.filter(
          (s) =>
            s.nameAr.toLowerCase().includes(query) ||
            s.nameEn.toLowerCase().includes(query) ||
            s.category.toLowerCase().includes(query) ||
            (s.descriptionAr?.toLowerCase().includes(query) ?? false)
        )
      : byAudience;
    const groups = new Map<string, Service[]>();
    for (const service of filtered) {
      const list = groups.get(service.category) ?? [];
      list.push(service);
      groups.set(service.category, list);
    }
    return [...groups.entries()];
  }, [servicesData, audienceFilter, search]);

  const hasRatings = !!feedbackData && feedbackData.count > 0;

  return (
    <div>
      <div className="relative isolate overflow-hidden px-4">
        <AmbientBackground />

        <section className="relative mx-auto flex max-w-3xl flex-col items-center py-16 text-center sm:py-24">
          <div className="glass-panel w-full rounded-[2rem] px-6 py-10 shadow-xl shadow-slate-900/5 dark:shadow-black/20 sm:px-12 sm:py-14">
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-4 py-1.5 text-sm font-bold text-brand-dark dark:text-brand-light">
              <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_0_4px_rgba(243,156,18,0.16)]" />
              مستشارك الرقمي للخدمات الحكومية
            </span>

            <h1 className="text-4xl font-extrabold leading-tight text-balance sm:text-6xl">
              صف طلبك
              <br />
              <span className="bg-gradient-to-l from-brand-light to-brand bg-clip-text text-transparent">
                نتولى الباقي
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
              ميسوور في خدمتك — تفضل، كيف أقدر أخدمك؟ صف طلبك وسنشخّص احتياجك، نطلب المستندات، ونتابع الإجراء حتى الإنجاز.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link to="/register" className="btn-primary">ابدأ الآن مجاناً</Link>
              <Link to="/login" className="btn-secondary">لدي حساب</Link>
            </div>

            <p className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7" />
              </svg>
              شفافية في الرسوم
              <span aria-hidden="true">·</span>
              تقييم بعد كل معاملة
            </p>
          </div>
        </section>

        <section className="relative mx-auto max-w-6xl pb-20 sm:pb-28">
          <p className="mb-8 text-center text-sm font-bold text-slate-500 dark:text-slate-400">ميسوور بالأرقام</p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="stat-card">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand-light">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 5h16a1 1 0 011 1v9a1 1 0 01-1 1H9l-4 4v-4H4a1 1 0 01-1-1V6a1 1 0 011-1z" />
                </svg>
              </div>
              <div className="typing-dots absolute end-6 top-6 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              </div>
              <p className="text-3xl font-extrabold tabular-nums">
                <StatCounter target={24} suffix="/7" />
              </p>
              <p className="mt-1 font-semibold">مساعد ذكي جاهز دائماً</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">نص، صوت، أو صورة — بأسلوبك</p>
            </div>

            <div className="stat-card">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent dark:bg-accent/20">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <rect x="4" y="4" width="7" height="7" rx="1.5" />
                  <rect x="13" y="4" width="7" height="7" rx="1.5" />
                  <rect x="4" y="13" width="7" height="7" rx="1.5" />
                  <rect x="13" y="13" width="7" height="7" rx="1.5" />
                </svg>
              </div>
              <svg className="grow-plus absolute end-6 top-6 text-accent" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <p className="text-3xl font-extrabold tabular-nums">
                <StatCounter target={servicesData?.services.length} suffix="+" />
              </p>
              <p className="mt-1 font-semibold">خدمات حكومية مدعومة</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">ونضيف خدمات جديدة باستمرار</p>
            </div>

            <div className="stat-card">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand-light">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                  <path d="M12 3l7 3v5c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3z" />
                  <path d="M9 12l2 2 4-4" strokeLinecap="round" />
                </svg>
              </div>
              <span className="pulse-dot absolute end-6 top-6 h-2.5 w-2.5 rounded-full bg-brand text-brand" />
              {hasRatings ? (
                <>
                  <p className="text-3xl font-extrabold tabular-nums">
                    <StatCounter target={feedbackData!.averageRating} suffix="/5" decimals={1} />
                  </p>
                  <p className="mt-1 font-semibold">تقييم حقيقي من عملائنا</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">بناءً على {feedbackData!.count} تقييم</p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-extrabold tabular-nums">
                    <StatCounter target={100} suffix="%" />
                  </p>
                  <p className="mt-1 font-semibold">تقييم إلزامي لكل معاملة</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">شفافية كاملة قبل الإغلاق</p>
                </>
              )}
            </div>

            <div className="stat-card">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent dark:bg-accent/20">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <circle cx="5" cy="12" r="2" fill="currentColor" stroke="none" />
                  <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
                  <circle cx="19" cy="12" r="2" fill="currentColor" stroke="none" />
                  <path d="M7 12h3M14 12h3" />
                </svg>
              </div>
              <div className="step-progress absolute end-6 top-6 flex items-center gap-1 text-accent">
                <span className="active h-1.5 w-1.5 rounded-full bg-accent" />
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                <span className="active h-1.5 w-1.5 rounded-full bg-accent" />
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                <span className="active h-1.5 w-1.5 rounded-full bg-accent" />
              </div>
              <p className="text-3xl font-extrabold tabular-nums">
                <StatCounter target={3} />
              </p>
              <p className="mt-1 font-semibold">خطوات فقط حتى الإنجاز</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">تشخيص، دفع، ثم متابعة</p>
            </div>
          </div>
        </section>
      </div>

      <section className="mx-auto max-w-6xl px-4 py-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="card p-6">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand-light">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                {f.icon}
              </svg>
            </div>
            <h3 className="font-bold text-lg mb-2">{f.title}</h3>
            <p className="text-sm text-slate-500">{f.desc}</p>
          </div>
        ))}
      </section>

      <section className="bg-slate-900 dark:bg-black py-16">
        <div className="mx-auto max-w-6xl px-4 grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="order-2 lg:order-1">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold text-brand-light">
              مدعوم بالذكاء الاصطناعي
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-4 mb-3">
              تجربة محادثة فريدة لإنجاز مهامك
            </h2>
            <p className="text-slate-400 mb-6 leading-relaxed">
              لا تعبئة نماذج معقدة ولا بحث في مواقع متفرقة — فقط صف طلبك بأسلوبك، وميسوور يتولى التشخيص والمتابعة.
            </p>
            <ul className="flex flex-col gap-3 mb-8">
              {[
                "فهم طبيعي للغة العربية بلهجاتها المحلية",
                "تحليل صور المستندات تلقائياً عبر الذكاء الاصطناعي",
                "تشخيص فوري للخدمة المطلوبة دون تخمين",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-slate-200">
                  <svg className="text-brand-light shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M5 12.5l4.5 4.5L19 7" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
            <Link to="/register" className="btn-primary">جرّب المحادثة الآن</Link>
          </div>

          <div className="order-1 lg:order-2 rounded-2xl bg-slate-800/60 border border-white/10 p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-4 text-white text-sm font-bold">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-l from-brand-light to-brand text-xs">م</span>
              مساعد ميسوور الذكي
              <span className="mr-auto flex items-center gap-1 text-xs font-normal text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> متصل الآن
              </span>
            </div>
            <div className="flex flex-col gap-3">
              <div className="max-w-[85%] rounded-2xl bg-slate-700/70 px-4 py-3 text-sm text-slate-100">
                أهلاً بك في ميسوور، كيف يمكنني مساعدتك اليوم؟
              </div>
              <div className="max-w-[85%] mr-auto rounded-2xl bg-gradient-to-l from-brand-light to-brand px-4 py-3 text-sm text-white">
                أبغى أجدد رخصة القيادة
              </div>
              <div className="max-w-[85%] rounded-2xl bg-slate-700/70 px-4 py-3 text-sm text-slate-100">
                تمام! رسوم التجديد 40 ريال وتستغرق يوماً واحداً تقريباً. هل تريد البدء الآن؟
              </div>
            </div>
          </div>
        </div>
      </section>

      {testimonialsData && testimonialsData.testimonials.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-2xl font-bold mb-2 text-center">ماذا يقول عملاؤنا</h2>
          <p className="text-sm text-slate-500 text-center mb-8">
            تقييمات حقيقية مختارة من عملاء أنجزوا معاملاتهم عبر ميسوور
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {testimonialsData.testimonials.map((t) => (
              <div key={t.id} className="card p-5">
                <span className="text-accent text-sm">{"★".repeat(t.rating)}{"☆".repeat(5 - t.rating)}</span>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">"{t.comment}"</p>
                <div className="flex items-center gap-2.5 mt-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand text-xs font-bold">
                    {t.displayName[0]}
                  </span>
                  <p className="text-xs text-slate-400">{t.displayName} · {t.serviceNameAr}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center mt-6">
            <Link to="/trust" className="text-sm text-brand font-semibold hover:underline">كيف نحمي بياناتك؟</Link>
          </p>
        </section>
      )}

      {servicesData && servicesData.services.length > 0 && (
        <section id="services" className="mx-auto max-w-6xl px-4 py-12 scroll-mt-20">
          <h2 className="text-2xl font-bold mb-2 text-center">كل خدمات الجهات الحكومية في مكان واحد</h2>
          <p className="text-sm text-slate-500 text-center mb-6">
            {servicesData.services.length} خدمة تغطي المواطن والمقيم والزائر ومنشآت الأعمال
          </p>

          <div className="mx-auto mb-6 max-w-md">
            <div className="relative">
              <svg
                className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن خدمة... (مثال: رخصة، جواز، عيادة)"
                className="input !pr-10"
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {AUDIENCE_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setAudienceFilter(f.key)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  audienceFilter === f.key ? "bg-brand text-white" : "btn-secondary"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {groupedServices.length === 0 && (
            <p className="text-center text-slate-500">لا توجد خدمات تطابق بحثك.</p>
          )}

          <div className="flex flex-col gap-10">
            {groupedServices.map(([category, categoryServices]) => (
              <div key={category}>
                <h3 className="font-bold text-lg mb-4 border-r-4 border-brand pr-3">{category}</h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {categoryServices.map((s) => (
                    <div key={s.id} className="card p-5 transition hover:-translate-y-1 hover:shadow-md relative">
                      {token && (
                        <button
                          onClick={() => toggleFavorite(s.id)}
                          aria-label={favoriteIds.has(s.id) ? "إزالة من المفضلة" : "إضافة للمفضلة"}
                          className="absolute left-3 top-3 text-lg leading-none"
                        >
                          {favoriteIds.has(s.id) ? (
                            <span className="text-accent">★</span>
                          ) : (
                            <span className="text-slate-300 hover:text-accent transition-colors">☆</span>
                          )}
                        </button>
                      )}
                      <p className="font-semibold pl-5">{s.nameAr}</p>
                      {s.descriptionAr && <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{s.descriptionAr}</p>}
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-sm text-brand font-bold">
                          {Number(s.platformFeeSar) > 0 ? `${s.platformFeeSar} ريال رسوم المنصة` : "مجاني"}
                        </span>
                        <span className="text-xs text-slate-400">{s.estimatedDays} يوم تقريباً</span>
                      </div>
                      {Number(s.govFeeEstimateSar) > 0 && (
                        <p className="mt-1 text-[11px] text-slate-400">
                          + رسوم حكومية تقديرية {s.govFeeEstimateSar} ريال، تُدفع مباشرة في المنصة الحكومية الرسمية
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="rounded-3xl bg-gradient-to-l from-brand-dark to-brand px-6 py-12 sm:px-16 text-center text-white">
          <h2 className="text-2xl sm:text-3xl font-extrabold mb-3">جاهز لتجربة أسهل لإنجاز معاملاتك؟</h2>
          <p className="opacity-90 mb-8 max-w-xl mx-auto">
            انضم إلى ميسوور اليوم واستمتع بخدمة حكومية رقمية متطورة تلبي احتياجاتك.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/register" className="rounded-xl bg-white px-6 py-3 font-semibold text-brand hover:opacity-90 transition">
              ابدأ مجاناً الآن
            </Link>
            <a href="#services" className="rounded-xl border border-white/40 px-6 py-3 font-semibold text-white hover:bg-white/10 transition">
              تصفّح الخدمات
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="mx-auto max-w-6xl px-4 py-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="flex items-center gap-2 text-lg font-extrabold text-brand mb-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-l from-brand-light to-brand text-white text-sm">م</span>
              ميسوور
            </p>
            <p className="text-sm text-slate-500 leading-relaxed">
              مستشارك الرقمي للخدمات الحكومية السعودية — نشخّص طلبك ونتابعه حتى الإنجاز.
            </p>
          </div>

          <div>
            <p className="font-bold mb-3 text-sm">المنصة</p>
            <div className="flex flex-col gap-2 text-sm text-slate-500">
              <Link to="/" className="hover:text-brand">الرئيسية</Link>
              <Link to="/trust" className="hover:text-brand">الأمان والثقة</Link>
              <Link to="/register" className="hover:text-brand">إنشاء حساب</Link>
            </div>
          </div>

          <div>
            <p className="font-bold mb-3 text-sm">الخدمات</p>
            <div className="flex flex-col gap-2 text-sm text-slate-500">
              <span>الهوية والأحوال المدنية</span>
              <span>الإقامة والجوازات</span>
              <span>المرور والمركبات</span>
              <span>الأعمال والاستثمار</span>
            </div>
          </div>

          <div>
            <p className="font-bold mb-3 text-sm">تواصل معنا</p>
            <p className="text-sm text-slate-500 mb-3">support@mysorat.sa</p>
            <div className="flex gap-3 text-slate-400">
              <span aria-hidden="true">🌐</span>
              <span aria-hidden="true">📷</span>
              <span aria-hidden="true">💬</span>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-100 dark:border-slate-900 py-4 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} ميسوور — جميع الحقوق محفوظة
        </div>
      </footer>
    </div>
  );
}
