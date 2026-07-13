import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="text-5xl font-extrabold text-brand">404</h1>
      <p className="text-slate-500">الصفحة التي تبحث عنها غير موجودة.</p>
      <Link to="/" className="btn-primary">العودة للرئيسية</Link>
    </div>
  );
}
