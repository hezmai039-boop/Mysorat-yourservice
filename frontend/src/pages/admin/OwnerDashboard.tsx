import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../../lib/api";
import { useAuthStore } from "../../store/auth";

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

interface FeedbackItem {
  id: string;
  rating: number;
  comment: string | null;
  ownerReply: string | null;
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
}

type Tab = "stats" | "feedback" | "links" | "experts" | "customers";

interface CustomerItem {
  id: string;
  email: string;
  phone: string | null;
  accountType: "INDIVIDUAL" | "BUSINESS" | null;
  segment: "NEW" | "REGULAR" | "VIP" | "AT_RISK";
  segmentOverridden: boolean;
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
      ]
    : [["customers", "عملائي"]];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
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
    </div>
  );
}

function CustomersTab() {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const { data } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => (await api.get("/customers")).data as { customers: CustomerItem[] },
  });

  async function setSegment(id: string, segment: CustomerItem["segment"]) {
    setError("");
    try {
      await api.patch(`/customers/${id}/segment`, { segment });
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  if (!data) return <p className="text-slate-500">جارِ التحميل...</p>;
  if (data.customers.length === 0) return <p className="text-slate-500">لا يوجد عملاء بعد.</p>;

  return (
    <div className="grid gap-4">
      {error && <p className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{error}</p>}
      {data.customers.map((c) => (
        <div key={c.id} className="card p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-sm">
              {c.individualProfile?.fullName ?? c.businessProfile?.companyName ?? c.email}
            </p>
            <p className="text-xs text-slate-500 mt-1">{c.email} · {c._count.operations} عملية</p>
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
          </div>
        </div>
      ))}
    </div>
  );
}

function StatsTab() {
  const { data } = useQuery({ queryKey: ["admin-stats"], queryFn: async () => (await api.get("/admin/stats")).data as Stats });
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
        <StatCard label="إجمالي المستخدمين" value={data.totalUsers} />
        <StatCard label="أفراد" value={data.individuals} />
        <StatCard label="منشآت" value={data.businesses} />
        <StatCard label="خبراء نشطون" value={data.expertsCount} />
        <StatCard label="متوسط التقييم" value={data.feedbackAverage.toFixed(1)} />
        <StatCard label="عدد التقييمات" value={data.feedbackCount} />
        <StatCard label="روابط تالفة" value={data.brokenLinks} accent={data.brokenLinks > 0} />
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

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="card p-5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent ? "text-red-500" : ""}`}>{value}</p>
    </div>
  );
}

function FeedbackTab() {
  const queryClient = useQueryClient();
  const [replies, setReplies] = useState<Record<string, string>>({});
  const { data } = useQuery({ queryKey: ["admin-feedback"], queryFn: async () => (await api.get("/feedback")).data as { feedback: FeedbackItem[] } });

  async function reply(id: string) {
    const text = replies[id];
    if (!text) return;
    await api.post(`/feedback/${id}/reply`, { reply: text });
    await queryClient.invalidateQueries({ queryKey: ["admin-feedback"] });
  }

  return (
    <div className="grid gap-4">
      {data?.feedback.map((f) => (
        <div key={f.id} className="card p-5">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm">{f.user.email} — {f.operation.service.nameAr}</p>
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
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${l.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {l.status === "ACTIVE" ? "يعمل" : "تالف"}
            </span>
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
