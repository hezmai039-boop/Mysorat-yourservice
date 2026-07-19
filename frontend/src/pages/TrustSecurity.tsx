import { useTranslation } from "react-i18next";

const MEASURE_KEYS = [
  "passwordEncryption",
  "twoFactorOptional",
  "dataIsolation",
  "secureDocumentStorage",
  "fullAuditLog",
  "loginProtection",
];

export default function TrustSecurity() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-extrabold text-center mb-3">{t("trust.title")}</h1>
      <p className="text-center text-slate-500 mb-12">
        {t("trust.subtitle")}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {MEASURE_KEYS.map((key) => (
          <div key={key} className="card p-5">
            <h3 className="font-bold mb-2">{t(`trust.measures.${key}.title`)}</h3>
            <p className="text-sm text-slate-500 leading-relaxed">{t(`trust.measures.${key}.desc`)}</p>
          </div>
        ))}
      </div>

      <div className="card p-6 mt-8">
        <h3 className="font-bold mb-2">{t("trust.noteTitle")}</h3>
        <p className="text-sm text-slate-500 leading-relaxed">
          {t("trust.noteBody")}
        </p>
      </div>
    </div>
  );
}
