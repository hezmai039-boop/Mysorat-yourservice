import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, apiErrorMessage } from "../lib/api";

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
        <h1 className="text-2xl font-bold text-center">{t("forgotPassword.checkEmailTitle")}</h1>
        <div className="card p-6 text-center">
          <p className="text-slate-600 dark:text-slate-300">
            {t("forgotPassword.checkEmailPrefix")} <span className="font-semibold">{email}</span>{" "}
            {t("forgotPassword.checkEmailSuffix")}
          </p>
        </div>
        <p className="text-center text-sm text-slate-500">
          <Link to="/login" className="text-brand font-semibold">{t("forgotPassword.backToLogin")}</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-bold text-center">{t("forgotPassword.title")}</h1>
      <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-4">
        {error && <p className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{error}</p>}
        <p className="text-sm text-slate-500">{t("forgotPassword.instructions")}</p>
        <input
          className="input"
          type="email"
          placeholder={t("forgotPassword.emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button className="btn-primary" disabled={loading}>{loading ? t("forgotPassword.sending") : t("forgotPassword.sendLink")}</button>
      </form>
      <p className="text-center text-sm text-slate-500">
        <Link to="/login" className="text-brand font-semibold">{t("forgotPassword.backToLogin")}</Link>
      </p>
    </div>
  );
}
