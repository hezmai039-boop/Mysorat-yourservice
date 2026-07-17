import { FormEvent, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, apiErrorMessage } from "../lib/api";
import { useAuthStore } from "../store/auth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { email, password });
      if (res.data.requires2FA) {
        setTempToken(res.data.tempToken);
      } else {
        setAuth(res.data.token, res.data.user);
        navigate("/dashboard");
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify2FA(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/2fa/verify-login", { tempToken, token: twoFactorCode });
      setAuth(res.data.token, res.data.user);
      navigate("/dashboard");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (tempToken) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
        <h1 className="text-2xl font-bold text-center">التحقق بخطوتين</h1>
        <form onSubmit={handleVerify2FA} className="card p-6 flex flex-col gap-4">
          {error && <p className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{error}</p>}
          <p className="text-sm text-slate-500 text-center">أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة</p>
          <input
            className="input text-center tracking-widest text-lg"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={twoFactorCode}
            onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ""))}
            autoFocus
            required
          />
          <button className="btn-primary" disabled={loading || twoFactorCode.length !== 6}>
            {loading ? "جارِ التحقق..." : "تحقق ودخول"}
          </button>
          <button type="button" className="text-sm text-slate-500" onClick={() => setTempToken(null)}>
            العودة لتسجيل الدخول
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-bold text-center">تسجيل الدخول</h1>
      <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-4">
        {error && <p className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{error}</p>}
        <input className="input" type="email" placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="btn-primary" disabled={loading}>{loading ? "جارِ الدخول..." : "دخول"}</button>
        <Link to="/forgot-password" className="text-sm text-slate-500 text-center hover:text-brand">نسيت كلمة المرور؟</Link>
      </form>
      <p className="text-center text-sm text-slate-500">
        ليس لديك حساب؟ <Link to="/register" className="text-brand font-semibold">أنشئ حساباً</Link>
      </p>
    </div>
  );
}
