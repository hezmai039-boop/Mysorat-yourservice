import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../../lib/api";
import { useAuthStore } from "../../store/auth";
import { Sidebar } from "../../components/Sidebar";

interface Stats {
  totalUsers: number;
  individuals: number;
  businesses: number;
  operationsByStatus: { status: string; _count: number }[];
  feedbackAverage: number;
  feedbackCount: number;
  brokenLinks: number;
  expertsCount: number;
}

interface Analytics {
  topServices: { serviceId: string; nameAr: string; count: number }[];
  overdueByService: { serviceId: string; nameAr: string; count: number }[];
  slowestServices: { serviceId: string; nameAr: string; sampleSize: number; avgActualDays: number; estimatedDays: number; overBy: number }[];
}

function BarRow({ label, value, max, tone = "brand" }: { label: string; value: number; max: number; tone?: "brand" | "danger" }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 truncate text-xs text-slate-600 dark:text-slate-300" title={label}>{label}</span>
      <div className="flex-1 h-5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${tone === "danger" ? "bg-red-500" : "bg-brand"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-200 text-left">{value}</span>
    </div>
  );
}

interface FeedbackItem {
  id: string;
  rating: number;
  comment: string | null;
  ownerReply: string | null;
  featured: boolean;
  createdAt: string;
  user: { email: string };
  operation: { service: { nameAr: string } };
}

interface LinkItem {
  id: string;
  nameAr: string;
  url: string;
  category: string;
  status: "ACTIVE" | "BROKEN" | "CHECKING";
  lastCheckedAt: string | null;
  lastError: string | null;
}

function formatLastChecked(iso: string | null): string {
  if (!iso) return "لم يُفحص بعد";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 1) return "آخر فحص: الآن";
  if (diffMins < 60) return `آخر فحص: قبل ${diffMins} دقيقة`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `آخر فحص: قبل ${diffHours} ساعة`;
  const diffDays = Math.round(diffHours / 24);
  return `آخر فحص: قبل ${diffDays} يوم`;
}

type Tab = "stats" | "feedback" | "links" | "experts" | "customers" | "support";

interface SupportRequestItem {
  id: string;
  message: string;
  status: "OPEN" | "ANSWERED" | "CLOSED";
  ownerReply: string | null;
  createdAt: string;
  user: { email: string; segment: CustomerItem["segment"] };
}

interface CustomerItem {
  id: string;
  email: string;
  phone: string | null;
  accountType: "INDIVIDUAL" | "BUSINESS" | null;
  segment: "NEW" | "REGULAR" | "VIP" | "AT_RISK";
  segmentOverridden: boolean;
  isActive: boolean;
  createdAt: string;
  individualProfile: { fullName: string } | null;
  businessProfile: { companyName: string } | null;
  _count: { operations: number };
}

const SEGMENT_LABELS: Record<CustomerItem["segment"], string> = {
  NEW: "جديد",
  REGULAR: "منتظم",
  VIP: "مميز",
  AT_RISK: "بحاجة لمتابعة",
};

const SEGMENT_STYLES: Record<CustomerItem["segment"], string> = {
  NEW: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  REGULAR: "bg-brand/10 text-brand",
  VIP: "bg-accent/10 text-accent",
  AT_RISK: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
};

export default function OwnerDashboard() {
  const { user } = useAuthStore();
  const isOwner = user?.role === "OWNER";
  const [tab, setTab] = useState<Tab>(isOwner ? "stats" : "customers");

  const tabs: [Tab, string][] = isOwner
    ? [
        ["stats", "الإحصاءات والتصدير"],
        ["customers", "العملاء"],
        ["feedback", "التعليقات"],
        ["links", "الروابط الحكومية"],
        ["experts", "الخبراء"],
        ["support", "طلبات الدعم"],
      ]
    : [["customers", "عملائي"]];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 flex gap-6 items-start">
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-bold mb-6">{isOwner ? "لوحة تحكم المالك" : "لوحة الخبير"}</h1>
        <div className="flex gap-2 mb-6 flex-wrap">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === key ? "bg-brand text-white" : "btn-secondary"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "stats" && <StatsTab />}
        {tab === "customers" && <CustomersTab />}
        {tab === "feedback" && <FeedbackTab />}
        {tab === "links" && <LinksTab />}
        {tab === "experts" && <ExpertsTab />}
        {tab === "support" && <SupportTab />}
      </div>

      <Sidebar />
    </div>
  );
}

const CUSTOMERS_PAGE_SIZE = 30;

function CustomersTab() {
  const { user } = useAuthStore();
  const isOwner = user?.role === "OWNER";
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [total, setTotal] = useState(0);

  const { data, isLoading, isError, error: queryError, refetch } = useQuery({
    queryKey: ["customers", page],
    queryFn: async () =>
      (await api.get("/customers", { params: { page, pageSize: CUSTOMERS_PAGE_SIZE } })).data as {
        customers: CustomerItem[];
        total: number;
      },
    retry: 1,
  });

  useEffect(() => {
    if (!data) return;
    setCustomers((prev) => (page === 1 ? data.customers : [...prev, ...data.customers]));
    setTotal(data.total);
  }, [data, page]);

  async function setSegment(id: string, segment: CustomerItem["segment"]) {
    setError("");
    try {
      await api.patch(`/customers/${id}/segment`, { segment });
      setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, segment, segmentOverridden: true } : c)));
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function toggleStatus(id: string, isActive: boolean) {
    setError("");
    try {
      await api.patch(`/customers/${id}/status`, { isActive });
      setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, isActive } : c)));
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  if (isLoading && customers.length === 0) return <p className="text-slate-500">جارِ التحميل...</p>;
  if (isError && customers.length === 0) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-950 p-4 text-sm text-red-600">
        <p>{apiErrorMessage(queryError)}</p>
        <button className="btn-secondary !px-3 !py-1.5 text-xs mt-3" onClick={() => refetch()}>إعادة المحاولة</button>
      </div>
    );
  }
  if (customers.length === 0) return <p className="text-slate-500">لا يوجد عملاء بعد.</p>;

  const hasMore = customers.length < total;

  return (
    <div className="grid gap-4">
      {error && <p className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{error}</p>}
      {customers.map((c) => (
        <div key={c.id} className="card p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand text-sm font-bold uppercase">
              {(c.individualProfile?.fullName ?? c.businessProfile?.companyName ?? c.email)[0]}
            </span>
            <div>
              <p className="font-semibold text-sm">
                {c.individualProfile?.fullName ?? c.businessProfile?.companyName ?? c.email}
                {!c.isActive && (
                  <span className="mr-2 rounded-full bg-red-100 dark:bg-red-950 px-2 py-0.5 text-xs font-semibold text-red-600">موقوف</span>
                )}
              </p>
              <p className="text-xs text-slate-500 mt-1">{c.email} · {c._count.operations} عملية</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${SEGMENT_STYLES[c.segment]}`}>
              {SEGMENT_LABELS[c.segment]}
              {c.segmentOverridden && " (يدوي)"}
            </span>
            <select
              className="input !w-auto !py-1.5 text-xs"
              value={c.segment}
              onChange={(e) => setSegment(c.id, e.target.value as CustomerItem["segment"])}
            >
              {(Object.keys(SEGMENT_LABELS) as CustomerItem["segment"][]).map((s) => (
                <option key={s} value={s}>{SEGMENT_LABELS[s]}</option>
              ))}
            </select>
            {isOwner && (
              <button
                className={`btn-secondary !px-3 !py-1.5 text-xs ${c.isActive ? "hover:!text-red-600" : "hover:!text-green-600"}`}
                onClick={() => toggleStatus(c.id, !c.isActive)}
              >
                {c.isActive ? "إيقاف الحساب" : "إعادة التفعيل"}
              </button>
            )}
          </div>
        </div>
      ))}
      {hasMore && (
        <div className="flex justify-center mt-2">
          <button className="btn-secondary" disabled={isLoading} onClick={() => setPage((p) => p + 1)}>
            {isLoading ? "جارِ التحميل..." : "تحميل المزيد"}
          </button>
        </div>
      )}
    </div>
  );
}

function StatsTab() {
  const { data } = useQuery({ queryKey: ["admin-stats"], queryFn: async () => (await api.get("/admin/stats")).data as Stats });
  const { data: analytics } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: async () => (await api.get("/admin/analytics")).data as Analytics,
  });
  const [error, setError] = useState("");

  async function exportCsv(type: string, range: string) {
    setError("");
    try {
      const res = await api.get(`/admin/export`, { params: { type, range }, responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mysorat-${type}-${range}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  if (!data) return <p className="text-slate-500">جارِ التحميل...</p>;

  return (
    <div className="grid gap-6">
      {error && <p className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="👥" label="إجمالي المستخدمين" value={data.totalUsers} />
        <StatCard icon="🧍" label="أفراد" value={data.individuals} />
        <StatCard icon="🏢" label="منشآت" value={data.businesses} />
        <StatCard icon="🎓" label="خبراء نشطون" value={data.expertsCount} />
        <StatCard icon="⭐" label="متوسط التقييم" value={data.feedbackAverage.toFixed(1)} />
        <StatCard icon="💬" label="عدد التقييمات" value={data.feedbackCount} />
        <StatCard icon="⚠️" label="روابط تالفة" value={data.brokenLinks} accent={data.brokenLinks > 0} />
      </div>

      <div className="card p-6">
        <h3 className="font-bold mb-3">حالة العمليات</h3>
        <div className="flex flex-wrap gap-3">
          {data.operationsByStatus.map((s) => (
            <span key={s.status} className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs">
              {s.status}: {s._count}
            </span>
          ))}
        </div>
      </div>

      {analytics && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-6">
            <h3 className="font-bold mb-1">الخدمات الأكثر طلباً</h3>
            <p className="text-xs text-slate-500 mb-4">أعلى 8 خدمات حسب عدد المعاملات</p>
            {analytics.topServices.length === 0 ? (
              <p className="text-sm text-slate-500">لا توجد بيانات كافية بعد.</p>
            ) : (
              <div className="grid gap-2.5">
                {analytics.topServices.map((s) => (
                  <BarRow key={s.serviceId} label={s.nameAr} value={s.count} max={analytics.topServices[0].count} />
                ))}
              </div>
            )}
          </div>

          <div className="card p-6">
            <h3 className="font-bold mb-1">أكثر الخدمات تأخراً حالياً</h3>
            <p className="text-xs text-slate-500 mb-4">معاملات مفتوحة تجاوزت الوقت المتوقع لإنجازها</p>
            {analytics.overdueByService.length === 0 ? (
              <p className="text-sm text-slate-500">لا توجد معاملات متأخرة حالياً 🎉</p>
            ) : (
              <div className="grid gap-2.5">
                {analytics.overdueByService.map((s) => (
                  <BarRow key={s.serviceId} label={s.nameAr} value={s.count} max={analytics.overdueByService[0].count} tone="danger" />
                ))}
              </div>
            )}
          </div>

          <div className="card p-6 lg:col-span-2">
            <h3 className="font-bold mb-1">اختناقات فعلية: أين يتجاوز الإنجاز الوقت الموعود؟</h3>
            <p className="text-xs text-slate-500 mb-4">بناءً على معاملات مكتملة فعلياً، مقارنة الوقت الحقيقي بالوقت المتوقع لكل خدمة</p>
            {analytics.slowestServices.length === 0 ? (
              <p className="text-sm text-slate-500">لا توجد بيانات كافية بعد (تحتاج معاملات مكتملة أكثر).</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800">
                      <th className="text-right font-semibold py-2">الخدمة</th>
                      <th className="text-right font-semibold py-2">الوقت الفعلي</th>
                      <th className="text-right font-semibold py-2">الوقت الموعود</th>
                      <th className="text-right font-semibold py-2">الفارق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.slowestServices.map((s) => (
                      <tr key={s.serviceId} className="border-b border-slate-100 dark:border-slate-900 last:border-0">
                        <td className="py-2">{s.nameAr}</td>
                        <td className="py-2 tabular-nums">{s.avgActualDays} يوم</td>
                        <td className="py-2 text-slate-500">{s.estimatedDays} يوم</td>
                        <td className={`py-2 font-semibold ${s.overBy > 0 ? "text-red-600" : "text-green-600"}`}>
                          {s.overBy > 0 ? `+${s.overBy}` : s.overBy} يوم
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card p-6">
        <h3 className="font-bold mb-4">تصدير البيانات</h3>
        {["individuals", "businesses", "operations"].map((type) => (
          <div key={type} className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 py-3 last:border-0">
            <span className="text-sm">{type === "individuals" ? "الأفراد" : type === "businesses" ? "المنشآت" : "العمليات"}</span>
            <div className="flex gap-2">
              {["daily", "weekly", "monthly"].map((range) => (
                <button key={range} onClick={() => exportCsv(type, range)} className="btn-secondary !px-3 !py-1.5 text-xs">
                  {range === "daily" ? "يومي" : range === "weekly" ? "أسبوعي" : "شهري"}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent, icon }: { label: string; value: string | number; accent?: boolean; icon?: string }) {
  return (
    <div className="card p-5 flex items-center gap-3">
      {icon && (
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${
            accent ? "bg-red-50 dark:bg-red-950/40" : "bg-brand/10"
          }`}
        >
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className={`text-2xl font-bold tabular-nums ${accent ? "text-red-500" : ""}`}>{value}</p>
        <p className="text-xs text-slate-500 truncate">{label}</p>
      </div>
    </div>
  );
}

function FeedbackTab() {
  const queryClient = useQueryClient();
  const [replies, setReplies] = useState<Record<string, string>>({});
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-feedback"],
    queryFn: async () => (await api.get("/feedback")).data as { feedback: FeedbackItem[] },
  });

  async function reply(id: string) {
    const text = replies[id];
    if (!text) return;
    await api.post(`/feedback/${id}/reply`, { reply: text });
    await queryClient.invalidateQueries({ queryKey: ["admin-feedback"] });
  }

  async function toggleFeatured(id: string, featured: boolean) {
    await api.patch(`/feedback/${id}/feature`, { featured });
    await queryClient.invalidateQueries({ queryKey: ["admin-feedback"] });
  }

  if (isLoading) return <p className="text-slate-500">جارِ التحميل...</p>;
  if (isError) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-950 p-4 text-sm text-red-600">
        <p>{apiErrorMessage(error)}</p>
        <button className="btn-secondary !px-3 !py-1.5 text-xs mt-3" onClick={() => refetch()}>إعادة المحاولة</button>
      </div>
    );
  }
  if (!data || data.feedback.length === 0) return <p className="text-slate-500">لا توجد تعليقات بعد.</p>;

  return (
    <div className="grid gap-4">
      {data.feedback.map((f) => (
        <div key={f.id} className="card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand text-xs font-bold uppercase">
                {f.user.email[0]}
              </span>
              <p className="font-semibold text-sm">{f.user.email} — {f.operation.service.nameAr}</p>
            </div>
            <span className="text-brand-accent">{"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}</span>
          </div>
          {f.comment && <p className="text-sm text-slate-500 mt-2">{f.comment}</p>}
          {f.ownerReply ? (
            <p className="mt-3 rounded-lg bg-brand/10 p-3 text-xs text-brand">رد الإدارة: {f.ownerReply}</p>
          ) : (
            <div className="mt-3 flex gap-2">
              <input
                className="input !py-2 text-xs"
                placeholder="اكتب رداً..."
                value={replies[f.id] ?? ""}
                onChange={(e) => setReplies({ ...replies, [f.id]: e.target.value })}
              />
              <button className="btn-secondary !px-3 !py-2 text-xs" onClick={() => reply(f.id)}>رد</button>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3">
            <span className="text-xs text-slate-400">
              {f.featured ? "يظهر حالياً في صفحة الثقة العامة" : "غير معروض للزوار"}
            </span>
            <button
              disabled={!f.comment}
              title={!f.comment ? "لا يمكن عرض تقييم بدون تعليق نصي" : undefined}
              className={`btn-secondary !px-3 !py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed ${f.featured ? "!text-red-600" : "!text-brand"}`}
              onClick={() => toggleFeatured(f.id, !f.featured)}
            >
              {f.featured ? "إلغاء العرض العام" : "عرضه للزوار"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SupportTab() {
  const queryClient = useQueryClient();
  const [replies, setReplies] = useState<Record<string, string>>({});
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-support"],
    queryFn: async () => (await api.get("/support")).data as { requests: SupportRequestItem[] },
  });

  async function reply(id: string) {
    const text = replies[id];
    if (!text) return;
    await api.post(`/support/${id}/reply`, { reply: text });
    await queryClient.invalidateQueries({ queryKey: ["admin-support"] });
  }

  async function close(id: string) {
    await api.patch(`/support/${id}/close`);
    await queryClient.invalidateQueries({ queryKey: ["admin-support"] });
  }

  if (isLoading) return <p className="text-slate-500">جارِ التحميل...</p>;
  if (isError) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-950 p-4 text-sm text-red-600">
        <p>{apiErrorMessage(error)}</p>
        <button className="btn-secondary !px-3 !py-1.5 text-xs mt-3" onClick={() => refetch()}>إعادة المحاولة</button>
      </div>
    );
  }
  if (!data || data.requests.length === 0) return <p className="text-slate-500">لا توجد طلبات دعم مفتوحة.</p>;

  return (
    <div className="grid gap-4">
      {data.requests.map((r) => (
        <div key={r.id} className="card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand text-xs font-bold uppercase">
                {r.user.email[0]}
              </span>
              <p className="font-semibold text-sm">{r.user.email}</p>
              {r.user.segment === "VIP" && (
                <span className="rounded-full bg-accent/10 text-accent text-[11px] font-bold px-2 py-0.5">أولوية VIP</span>
              )}
            </div>
            <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString("ar-SA")}</span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">{r.message}</p>
          {r.ownerReply ? (
            <p className="mt-3 rounded-lg bg-brand/10 p-3 text-xs text-brand">ردك: {r.ownerReply}</p>
          ) : (
            <div className="mt-3 flex gap-2">
              <input
                className="input !py-2 text-xs"
                placeholder="اكتب رداً..."
                value={replies[r.id] ?? ""}
                onChange={(e) => setReplies({ ...replies, [r.id]: e.target.value })}
              />
              <button className="btn-secondary !px-3 !py-2 text-xs" onClick={() => reply(r.id)}>رد</button>
            </div>
          )}
          {r.status !== "CLOSED" && (
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3">
              <span className="text-xs text-slate-400">{r.status === "ANSWERED" ? "تم الرد" : "بانتظار الرد"}</span>
              <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => close(r.id)}>إغلاق الطلب</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LinksTab() {
  const queryClient = useQueryClient();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const { data } = useQuery({ queryKey: ["admin-links"], queryFn: async () => (await api.get("/links")).data as { links: LinkItem[] } });

  async function checkAll() {
    setChecking(true);
    setError("");
    try {
      await api.post("/links/check-all");
      await queryClient.invalidateQueries({ queryKey: ["admin-links"] });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setChecking(false);
    }
  }

  async function removeLink(id: string) {
    if (!confirm("حذف هذا الرابط نهائياً؟")) return;
    setError("");
    try {
      await api.delete(`/links/${id}`);
      await queryClient.invalidateQueries({ queryKey: ["admin-links"] });
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <button className="btn-primary mb-4" onClick={checkAll} disabled={checking}>
        {checking ? "جارِ الفحص..." : "فحص جميع الروابط الآن"}
      </button>
      {error && <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{error}</p>}
      <div className="grid gap-3">
        {data?.links.map((l) => (
          <div key={l.id} className="card flex items-center justify-between p-4">
            <div>
              <p className="font-semibold text-sm">{l.nameAr}</p>
              <a href={l.url} target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:underline">{l.url}</a>
              <p className="text-xs text-slate-400 mt-1">
                {formatLastChecked(l.lastCheckedAt)}
                {l.status === "BROKEN" && l.lastError && ` · ${l.lastError}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${l.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                {l.status === "ACTIVE" ? "يعمل" : "تالف"}
              </span>
              <button
                onClick={() => removeLink(l.id)}
                aria-label="حذف الرابط"
                className="btn-secondary !px-2 !py-1.5 text-xs text-red-600"
              >
                حذف
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExpertsTab() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [error, setError] = useState("");
  const { data } = useQuery({
    queryKey: ["admin-experts"],
    queryFn: async () => (await api.get("/admin/experts")).data as { experts: { id: string; specialty: string | null; user: { email: string } }[] },
  });

  async function addExpert() {
    setError("");
    try {
      await api.post("/admin/experts", { email, password: password || undefined, specialty: specialty || undefined });
      setEmail("");
      setPassword("");
      setSpecialty("");
      await queryClient.invalidateQueries({ queryKey: ["admin-experts"] });
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div className="grid gap-6">
      <div className="card p-5">
        <h3 className="font-bold mb-3">إضافة / ترقية خبير</h3>
        {error && <p className="mb-3 rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <input className="input !w-auto flex-1" placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input !w-auto flex-1" placeholder="كلمة مرور (لحساب جديد)" value={password} onChange={(e) => setPassword(e.target.value)} />
          <input className="input !w-auto flex-1" placeholder="التخصص" value={specialty} onChange={(e) => setSpecialty(e.target.value)} />
          <button className="btn-primary" onClick={addExpert}>إضافة</button>
        </div>
      </div>
      <div className="grid gap-3">
        {data?.experts.map((e) => (
          <div key={e.id} className="card p-4 flex justify-between">
            <span className="text-sm font-semibold">{e.user.email}</span>
            <span className="text-xs text-slate-500">{e.specialty ?? "عام"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
