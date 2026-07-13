import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Service } from "../types";

const FEATURES = [
  { title: "محادثة ذكية بالعربية", desc: "صف طلبك بالصوت أو النص أو صورة، وميسوور يشخّص احتياجك فوراً." },
  { title: "خطوة بخطوة بدون تعقيد", desc: "لا شرح تقني، فقط توجيه مباشر حتى إنجاز الخدمة." },
  { title: "تتبع لحظي", desc: "اعرف أين وصلت معاملتك وكم تبقى من الوقت." },
  { title: "خبراء عند الحاجة", desc: "إذا تعثرت الأتمتة، يتولى خبير مختص إكمال إجراءك يدوياً." },
];

export default function Landing() {
  const { data } = useQuery({
    queryKey: ["feedback-count"],
    queryFn: async () => (await api.get("/feedback/count")).data as { count: number; averageRating: number },
    retry: false,
  });

  const { data: servicesData } = useQuery({
    queryKey: ["services"],
    queryFn: async () => (await api.get("/services")).data as { services: Service[] },
    retry: false,
  });

  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 py-20 text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold leading-tight">
          <span className="bg-gradient-to-l from-brand-light to-brand bg-clip-text text-transparent">ميسوور</span>
          <br />
          مستشارك الرقمي للخدمات الحكومية
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
          ميسوور في خدمتك — تفضل، كيف أقدر أخدمك؟ صف طلبك وسنشخّص احتياجك، نطلب المستندات، ونتابع الإجراء حتى الإنجاز.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link to="/register" className="btn-primary">ابدأ الآن مجاناً</Link>
          <Link to="/login" className="btn-secondary">لدي حساب</Link>
        </div>
        {data && data.count > 0 && (
          <p className="mt-6 text-sm text-slate-500">
            ⭐ {data.averageRating.toFixed(1)} من 5 — بناءً على {data.count} تقييم من عملائنا
          </p>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="card p-6">
            <h3 className="font-bold text-lg mb-2">{f.title}</h3>
            <p className="text-sm text-slate-500">{f.desc}</p>
          </div>
        ))}
      </section>

      {servicesData && servicesData.services.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-2xl font-bold mb-6 text-center">الخدمات المتاحة</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {servicesData.services.map((s) => (
              <div key={s.id} className="card p-5">
                <p className="font-semibold">{s.nameAr}</p>
                <p className="text-xs text-slate-500 mt-1">{s.category}</p>
                <p className="mt-3 text-sm text-brand font-bold">{s.baseFeeSar} ريال</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
