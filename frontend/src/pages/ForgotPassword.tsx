import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiErrorMessage } from "../lib/api";

export default function ForgotPassword() {
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
        <h1 className="text-2xl font-bold text-center">تحقق من بريدك</h1>
        <div className="card p-6 text-center">
          <p className="text-slate-600 dark:text-slate-300">
            إن كان البريد الإلكتروني <span className="font-semibold">{email}</span> مسجلاً لدينا، ستصلك رسالة
            تحتوي رابط إعادة تعيين كلمة المرور خلال دقائق.
          </p>
        </div>
        <p className="text-center text-sm text-slate-500">
          <Link to="/login" className="text-brand font-semibold">العودة لتسجيل الدخول</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-bold text-center">نسيت كلمة المرور؟</h1>
      <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-4">
        {error && <p className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{error}</p>}
        <p className="text-sm text-slate-500">أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.</p>
        <input
          className="input"
          type="email"
          placeholder="البريد الإلكتروني"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button className="btn-primary" disabled={loading}>{loading ? "جارِ الإرسال..." : "إرسال رابط إعادة التعيين"}</button>
      </form>
      <p className="text-center text-sm text-slate-500">
        <Link to="/login" className="text-brand font-semibold">العودة لتسجيل الدخول</Link>
      </p>
    </div>
  );
}
