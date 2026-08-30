import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

// الرئيسية بنمط inDrive: بطاقة هيرو داكنة بشارة حبّية وعنوان يبرز فيه
// الليموني، ثم بطاقات ثقة، ثم فئات السوق الثلاث، ثم دعوة مقدمي الخدمة.

const CATEGORIES = [
  {
    key: "gov",
    cat: "خدمات حكومية",
    icon: "M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M9 11h.01M15 11h.01",
  },
  {
    key: "establish",
    cat: "تأسيس أعمال",
    icon: "M4 7h16v13H4zM9 7V4h6v3M12 11v5M9.5 13.5h5",
  },
  {
    key: "licenses",
    cat: "تراخيص",
    icon: "M6 3h9l4 4v14H6zM14 3v5h5M9 13l2 2 4-4",
  },
] as const;

const TRUST = [
  { key: "verified", icon: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4" },
  { key: "fast", icon: "M12 21a9 9 0 1 1 9-9M12 7v5l3 3M17 3l4 4" },
  { key: "rating", icon: "M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2-5.6-3.2-5.6 3.2 1.3-6.2L3 9.5l6.3-.7z" },
] as const;

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-6 w-6"} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export default function Landing() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 flex flex-col gap-10">
      {/* الهيرو */}
      <section className="card relative overflow-hidden p-8 md:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(193,241,29,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(193,241,29,0.06) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
          aria-hidden="true"
        />
        <div className="relative">
          <span className="inline-block rounded-full border border-brand/50 bg-brand/10 px-4 py-1 text-xs font-bold text-brand">
            {t("landing2.badge")}
          </span>
          <h1 className="mt-4 text-3xl md:text-5xl font-extrabold leading-snug">
            {t("landing2.titleA")}
            <span className="text-brand"> {t("landing2.titleB")}</span>
          </h1>
          <p className="mt-4 max-w-xl text-slate-600 dark:text-slate-300">{t("landing2.subtitle")}</p>
          <div className="mt-8">
            <Link to="/requests/new" className="btn-primary w-full md:w-auto md:!px-16 text-lg">
              {t("landing2.cta")}
            </Link>
          </div>
        </div>
      </section>

      {/* بطاقات الثقة */}
      <section className="grid gap-3 md:grid-cols-3">
        {TRUST.map((item) => (
          <div key={item.key} className="card flex items-center gap-3 p-4">
            <span className="text-brand"><Icon d={item.icon} /></span>
            <p className="text-sm font-semibold">{t(`landing2.trust.${item.key}`)}</p>
          </div>
        ))}
      </section>

      {/* الفئات الثلاث */}
      <section>
        <h2 className="mb-4 text-xl font-extrabold">{t("landing2.browseTitle")}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {CATEGORIES.map((c) => (
            <Link
              key={c.key}
              to={`/requests/new?cat=${encodeURIComponent(c.cat)}`}
              className="card group flex flex-col items-center gap-3 p-6 text-center transition hover:-translate-y-1 hover:border-brand/60"
            >
              <span className="text-brand"><Icon d={c.icon} className="h-9 w-9" /></span>
              <span className="font-bold">{t(`landing2.cats.${c.key}`)}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{t(`landing2.catsDesc.${c.key}`)}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* دعوة مقدمي الخدمة */}
      <section className="card flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-extrabold">{t("landing2.providerTitle")}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t("landing2.providerDesc")}</p>
        </div>
        <Link to="/provider" className="btn-primary shrink-0">
          {t("landing2.providerCta")}
        </Link>
      </section>
    </main>
  );
}
