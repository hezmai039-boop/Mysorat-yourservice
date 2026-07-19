import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, apiErrorMessage } from "../lib/api";

export default function ResetPassword() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(t("resetPassword.mismatch"));
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
      setTimeout(() => navigate("/login"), 2500);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
        <h1 className="text-2xl font-bold text-center">{t("resetPassword.invalidLinkTitle")}</h1>
        <div className="card p-6 text-center text-slate-600 dark:text-slate-300">
          <p>{t("resetPassword.invalidLinkBody")}</p>
        </div>
        <p className="text-center text-sm text-slate-500">
          <Link to="/forgot-password" className="text-brand font-semibold">{t("resetPassword.requestNewLink")}</Link>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
        <h1 className="text-2xl font-bold text-center">{t("resetPassword.successTitle")}</h1>
        <div className="card p-6 text-center text-slate-600 dark:text-slate-300">
          <p>{t("resetPassword.successBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-bold text-center">{t("resetPassword.title")}</h1>
      <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-4">
        {error && <p className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{error}</p>}
        <input
          className="input"
          type="password"
          placeholder={t("resetPassword.newPasswordPlaceholder")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        <input
          className="input"
          type="password"
          placeholder={t("resetPassword.confirmPasswordPlaceholder")}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={8}
          required
        />
        <button className="btn-primary" disabled={loading}>{loading ? t("resetPassword.updating") : t("resetPassword.updatePassword")}</button>
      </form>
    </div>
  );
}
