import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";
import { Operation } from "../types";

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "بانتظار الدفع",
  DOCS_REQUIRED: "مطلوب مستندات",
  IN_PROGRESS: "قيد التنفيذ",
  DELAYED: "متأخر",
  ESCALATED_TO_EXPERT: "لدى خبير مختص",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغي",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING_PAYMENT: "bg-amber-100 text-amber-700",
  DOCS_REQUIRED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-brand/10 text-brand",
  DELAYED: "bg-orange-100 text-orange-700",
  ESCALATED_TO_EXPERT: "bg-purple-100 text-purple-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-slate-200 text-slate-600",
};

export default function Dashboard() {
  const { user } = useAuthStore();
  const { data, isLoading } = useQuery({
    queryKey: ["operations"],
    queryFn: async () => (await api.get("/operations")).data as { operations: Operation[] },
  });

  const operations = data?.operations ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {user?.role === "EXPERT" ? "لوحة الخبير" : "لوحتي"}
          </h1>
          <p className="text-slate-500 text-sm">{user?.email}</p>
        </div>
        {(user?.role === "INDIVIDUAL" || user?.role === "BUSINESS") && (
          <Link to="/chat" className="btn-primary">طلب خدمة جديدة</Link>
        )}
      </div>

      {isLoading && <p className="text-slate-500">جارِ التحميل...</p>}

      {!isLoading && operations.length === 0 && (
        <div className="card p-10 text-center">
          <p className="text-slate-500 mb-4">لا توجد لديك عمليات بعد.</p>
          {(user?.role === "INDIVIDUAL" || user?.role === "BUSINESS") && (
            <Link to="/chat" className="btn-primary">تحدث مع ميسوور الآن</Link>
          )}
        </div>
      )}

      <div className="grid gap-4">
        {operations.map((op) => (
          <Link
            key={op.id}
            to={`/operations/${op.id}`}
            className="card flex items-center justify-between p-5 hover:ring-2 hover:ring-brand transition"
          >
            <div>
              <p className="font-semibold">{op.service?.nameAr}</p>
              <p className="text-xs text-slate-500 mt-1">
                الخطوة {op.currentStep} من {op.totalSteps} · {op.feeAmountSar} ريال
                {op.delayed && <span className="text-orange-500"> · متأخر</span>}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[op.status]}`}>
              {STATUS_LABELS[op.status]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
