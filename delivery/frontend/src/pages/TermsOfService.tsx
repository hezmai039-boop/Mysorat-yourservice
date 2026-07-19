import { useTranslation } from "react-i18next";

const SECTION_KEYS = [
  "acceptance",
  "serviceDescription",
  "importantDisclaimer",
  "eligibility",
  "fees",
  "cancellation",
  "prohibitedUse",
  "intellectualProperty",
  "liability",
  "termination",
  "governingLaw",
  "changes",
  "contact",
];

export default function TermsOfService() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-extrabold text-center mb-3">{t("terms.title")}</h1>
      <p className="text-center text-slate-500 mb-2">{t("terms.subtitle")}</p>
      <p className="text-center text-xs text-slate-400 mb-12">{t("terms.lastUpdated")}</p>

      <div className="flex flex-col gap-6">
        {SECTION_KEYS.map((key) => (
          <div
            key={key}
            className={`card p-6 ${key === "importantDisclaimer" ? "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40" : ""}`}
          >
            <h2 className="font-bold mb-2">{t(`terms.sections.${key}.title`)}</h2>
            <p className="text-sm text-slate-500 leading-relaxed">{t(`terms.sections.${key}.body`)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
