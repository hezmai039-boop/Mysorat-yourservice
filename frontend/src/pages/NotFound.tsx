import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="text-5xl font-extrabold text-brand">404</h1>
      <p className="text-slate-500">{t("notFound.message")}</p>
      <Link to="/" className="btn-primary">{t("notFound.backHome")}</Link>
    </div>
  );
}
