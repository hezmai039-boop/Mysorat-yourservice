import { FormEvent, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, apiErrorMessage } from "../lib/api";
import { useAuthStore } from "../store/auth";

type AccountType = "INDIVIDUAL" | "BUSINESS";

export default function Register() {
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
      <h1 className="text-2xl font-bold text-center">إنشاء حساب</h1>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setAccountType("INDIVIDUAL")}
          className={`card p-5 text-center font-semibold transition ${accountType === "INDIVIDUAL" ? "ring-2 ring-brand text-brand" : ""}`}
        >
          👤 أفراد
        </button>
        <button
          type="button"
          onClick={() => setAccountType("BUSINESS")}
          className={`card p-5 text-center font-semibold transition ${accountType === "BUSINESS" ? "ring-2 ring-brand text-brand" : ""}`}
        >
          🏢 مؤسسات وشركات
        </button>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-4">
        {error && <p className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{error}</p>}

        {accountType === "INDIVIDUAL" ? (
          <input className="input" placeholder="الاسم الكامل" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        ) : (
          <>
            <input className="input" placeholder="اسم المنشأة" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
            <input className="input" placeholder="رقم السجل التجاري (اختياري)" value={crNumber} onChange={(e) => setCrNumber(e.target.value)} />
          </>
        )}

        <input className="input" type="email" placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="tel" placeholder="رقم الجوال (اختياري)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className="input" type="password" placeholder="كلمة المرور (8 أحرف على الأقل)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        <button className="btn-primary" disabled={loading}>{loading ? "جارِ الإنشاء..." : "إنشاء الحساب"}</button>
      </form>

      <p className="text-center text-sm text-slate-500">
        لديك حساب مسبقاً؟ <Link to="/login" className="text-brand font-semibold">سجّل الدخول</Link>
      </p>
    </div>
  );
}
