import { useTranslation } from "react-i18next";

const SECTION_KEYS = [
  "intro",
  "dataCollected",
  "purpose",
  "aiUsage",
  "thirdParties",
  "retention",
  "rights",
  "security",
  "transfer",
  "cookies",
  "children",
  "changes",
  "contact",
];

export default function PrivacyPolicy() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-extrabold text-center mb-3">{t("privacy.title")}</h1>
      <p className="text-center text-slate-500 mb-2">{t("privacy.subtitle")}</p>
      <p className="text-center text-xs text-slate-400 mb-12">{t("privacy.lastUpdated")}</p>

      <div className="flex flex-col gap-6">
        {SECTION_KEYS.map((key) => (
          <div key={key} className="card p-6">
            <h2 className="font-bold mb-2">{t(`privacy.sections.${key}.title`)}</h2>
            <p className="text-sm text-slate-500 leading-relaxed">{t(`privacy.sections.${key}.body`)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
