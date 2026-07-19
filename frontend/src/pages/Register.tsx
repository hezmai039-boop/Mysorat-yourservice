import { FormEvent, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, apiErrorMessage } from "../lib/api";
import { useAuthStore } from "../store/auth";

type AccountType = "INDIVIDUAL" | "BUSINESS";

export default function Register() {
  const { t } = useTranslation();
  const [accountType, setAccountType] = useState<AccountType>("INDIVIDUAL");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [crNumber, setCrNumber] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const referralCode = searchParams.get("ref") ?? undefined;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/register", {
        email,
        password,
        phone: phone || undefined,
        accountType,
        fullName: accountType === "INDIVIDUAL" ? fullName : undefined,
        companyName: accountType === "BUSINESS" ? companyName : undefined,
        crNumber: accountType === "BUSINESS" ? crNumber || undefined : undefined,
        referralCode,
      });
      setAuth(res.data.token, res.data.user);
      navigate("/dashboard");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-bold text-center">{t("register.title")}</h1>

      {referralCode && (
        <p className="text-center text-sm rounded-lg bg-brand/10 text-brand p-3">
          {t("register.referralBanner")}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setAccountType("INDIVIDUAL")}
          className={`card p-5 text-center font-semibold transition ${accountType === "INDIVIDUAL" ? "ring-2 ring-brand text-brand" : ""}`}
        >
          {t("register.individual")}
        </button>
        <button
          type="button"
          onClick={() => setAccountType("BUSINESS")}
          className={`card p-5 text-center font-semibold transition ${accountType === "BUSINESS" ? "ring-2 ring-brand text-brand" : ""}`}
        >
          {t("register.business")}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-4">
        {error && <p className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{error}</p>}

        {accountType === "INDIVIDUAL" ? (
          <input className="input" placeholder={t("register.fullNamePlaceholder")} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        ) : (
          <>
            <input className="input" placeholder={t("register.companyNamePlaceholder")} value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
            <input className="input" placeholder={t("register.crNumberPlaceholder")} value={crNumber} onChange={(e) => setCrNumber(e.target.value)} />
          </>
        )}

        <input className="input" type="email" placeholder={t("register.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="tel" placeholder={t("register.phonePlaceholder")} value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className="input" type="password" placeholder={t("register.passwordPlaceholder")} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        <button className="btn-primary" disabled={loading}>{loading ? t("register.creating") : t("register.createAccount")}</button>
      </form>

      <p className="text-center text-sm text-slate-500">
        {t("register.haveAccount")} <Link to="/login" className="text-brand font-semibold">{t("register.login")}</Link>
      </p>
    </div>
  );
}
