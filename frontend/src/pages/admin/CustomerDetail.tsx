import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../../lib/api";
import { useAuthStore } from "../../store/auth";

type Segment = "NEW" | "REGULAR" | "VIP" | "AT_RISK";
type ResidencyStatus = "CITIZEN" | "RESIDENT" | "VISITOR";

interface CustomerDetailData {
  customer: {
    id: string;
    email: string;
    phone: string | null;
    accountType: "INDIVIDUAL" | "BUSINESS" | null;
    segment: Segment;
    segmentOverridden: boolean;
    isActive: boolean;
    createdAt: string;
    termsAcceptedAt: string | null;
    referralCode: string;
    creditSar: string;
    individualProfile: {
      fullName: string;
      nationalId: string | null;
      nationality: string | null;
      city: string | null;
      residencyStatus: ResidencyStatus | null;
    } | null;
    businessProfile: { companyName: string; crNumber: string | null; city: string | null } | null;
  };
  operations: Array<{
    id: string;
    status: string;
    feeAmountSar: string;
    govFeeEstimateSar: string;
    creditAppliedSar: string;
    feePaid: boolean;
    currentStep: number;
    totalSteps: number;
    delayed: boolean;
    expectedCompletionAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
    createdAt: string;
    service: { code: string; nameAr: string; nameEn: string | null; category: string };
    feedback: Array<{ rating: number; comment: string | null; createdAt: string }>;
    _count: { documents: number };
  }>;
  vaultDocuments: Array<{
    id: string;
    docType: string;
    status: "PENDING" | "UPLOADED" | "VERIFIED" | "REJECTED";
    expiresAt: string | null;
    uploadedAt: string | null;
    verificationNote: string | null;
  }>;
  supportRequests: Array<{
    id: string;
    message: string;
    status: "OPEN" | "ANSWERED" | "CLOSED";
    ownerReply: string | null;
    createdAt: string;
  }>;
  stats: {
    totalOperations: number;
    completed: number;
    active: number;
    cancelled: number;
    lifetimePaidSar: number;
    averageRating: number | null;
    ratingCount: number;
  };
}

const SEGMENT_LABELS: Record<Segment, string> = {
  NEW: "جديد",
  REGULAR: "منتظم",
  VIP: "مميز",
  AT_RISK: "معرّض للفقد",
};

const SEGMENT_STYLES: Record<Segment, string> = {
  NEW: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  REGULAR: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  VIP: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  AT_RISK: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
};

const RESIDENCY_LABELS: Record<ResidencyStatus, string> = {
  CITIZEN: "مواطن",
  RESIDENT: "مقيم",
  VISITOR: "زائر",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "بانتظار الدفع",
  DOCS_REQUIRED: "بانتظار المستندات",
  IN_PROGRESS: "قيد التنفيذ",
  DELAYED: "متأخرة",
  ESCALATED_TO_EXPERT: "محوّلة لخبير",
  COMPLETED: "مكتملة",
  CANCELLED: "ملغاة",
};

const STATUS_STYLES: Record<string, string> = {
  PENDING_PAYMENT: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  DOCS_REQUIRED: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  IN_PROGRESS: "bg-brand/10 text-brand",
  DELAYED: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  ESCALATED_TO_EXPERT: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  COMPLETED: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  CANCELLED: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const DOC_STATUS_LABELS: Record<string, string> = {
  PENDING: "بانتظار الرفع",
  UPLOADED: "قيد المراجعة",
  VERIFIED: "موثّق",
  REJECTED: "مرفوض",
};

const DOC_STATUS_STYLES: Record<string, string> = {
  PENDING: "text-slate-400",
  UPLOADED: "text-amber-600",
  VERIFIED: "text-green-600",
  REJECTED: "text-red-600",
};

/** Days before expiry at which a stored document is flagged to staff. */
const EXPIRY_WARNING_DAYS = 30;

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("ar-SA") : "—";
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value || "—"}</p>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="card p-4">
      <p className={`text-xl font-extrabold tabular-nums ${tone ?? ""}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const isOwner = user?.role === "OWNER";
  const queryClient = useQueryClient();
  const [error, setError] = useState("");

  const { data, isLoading, isError, error: queryError } = useQuery({
    queryKey: ["customer-detail", id],
    queryFn: async () => (await api.get(`/customers/${id}`)).data as CustomerDetailData,
    enabled: !!id,
  });

  async function setSegment(segment: Segment) {
    setError("");
    try {
      await api.patch(`/customers/${id}/segment`, { segment });
      await queryClient.invalidateQueries({ queryKey: ["customer-detail", id] });
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function toggleStatus(isActive: boolean) {
    setError("");
    try {
      await api.patch(`/customers/${id}/status`, { isActive });
      await queryClient.invalidateQueries({ queryKey: ["customer-detail", id] });
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  if (isLoading) return <div className="mx-auto max-w-6xl px-4 py-10"><p className="text-slate-500">جارِ التحميل...</p></div>;

  if (isError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="rounded-lg bg-red-50 dark:bg-red-950 p-4 text-sm text-red-600">{apiErrorMessage(queryError)}</div>
        <Link to="/admin" className="btn-secondary mt-4 inline-block">العودة للوحة</Link>
      </div>
    );
  }

  if (!data) return null;

  const { customer, operations, vaultDocuments, supportRequests, stats } = data;
  const displayName = customer.individualProfile?.fullName ?? customer.businessProfile?.companyName ?? customer.email;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link to="/admin" className="text-sm text-brand hover:underline">← العودة لقائمة العملاء</Link>

      {error && <p className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600 mt-4">{error}</p>}

      {/* Identity header */}
      <div className="card p-6 mt-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand text-lg font-bold uppercase">
              {displayName[0]}
            </span>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2 flex-wrap">
                {displayName}
                {!customer.isActive && (
                  <span className="rounded-full bg-red-100 dark:bg-red-950 px-2 py-0.5 text-xs font-semibold text-red-600">موقوف</span>
                )}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-semibold">
                  {customer.accountType === "BUSINESS" ? "🏢 منشأة" : "👤 فرد"}
                </span>
                {customer.individualProfile?.residencyStatus && (
                  <span className="rounded-full bg-brand/10 text-brand px-2.5 py-0.5 text-xs font-semibold">
                    {RESIDENCY_LABELS[customer.individualProfile.residencyStatus]}
                  </span>
                )}
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${SEGMENT_STYLES[customer.segment]}`}>
                  {SEGMENT_LABELS[customer.segment]}
                  {customer.segmentOverridden && " (يدوي)"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              className="input !w-auto !py-1.5 text-xs"
              value={customer.segment}
              onChange={(e) => setSegment(e.target.value as Segment)}
            >
              {(Object.keys(SEGMENT_LABELS) as Segment[]).map((s) => (
                <option key={s} value={s}>{SEGMENT_LABELS[s]}</option>
              ))}
            </select>
            {isOwner && (
              <button
                className={`btn-secondary !px-3 !py-1.5 text-xs ${customer.isActive ? "hover:!text-red-600" : "hover:!text-green-600"}`}
                onClick={() => toggleStatus(!customer.isActive)}
              >
                {customer.isActive ? "إيقاف الحساب" : "إعادة التفعيل"}
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-6 pt-6 border-t border-slate-200 dark:border-slate-800">
          <Field label="البريد الإلكتروني" value={customer.email} />
          <Field label="رقم الجوال" value={customer.phone} />
          <Field label="عميل منذ" value={fmt(customer.createdAt)} />
          <Field label="وافق على الشروط" value={fmt(customer.termsAcceptedAt)} />

          {customer.individualProfile && (
            <>
              <Field label="رقم الهوية" value={customer.individualProfile.nationalId} />
              <Field label="الجنسية" value={customer.individualProfile.nationality} />
              <Field label="المدينة" value={customer.individualProfile.city} />
            </>
          )}
          {customer.businessProfile && (
            <>
              <Field label="رقم السجل التجاري" value={customer.businessProfile.crNumber} />
              <Field label="المدينة" value={customer.businessProfile.city} />
            </>
          )}
          <Field label="رمز الإحالة" value={customer.referralCode} />
          <Field label="رصيد المحفظة" value={`${customer.creditSar} ريال`} />
        </div>
      </div>

      {/* Lifetime stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mt-6">
        <StatCard label="إجمالي المعاملات" value={stats.totalOperations} />
        <StatCard label="قيد التنفيذ" value={stats.active} tone="text-brand" />
        <StatCard label="مكتملة" value={stats.completed} tone="text-green-600" />
        <StatCard label="إجمالي المدفوع" value={`${stats.lifetimePaidSar} ريال`} />
        <StatCard
          label={stats.ratingCount ? `متوسط التقييم (${stats.ratingCount})` : "لا تقييمات بعد"}
          value={stats.averageRating != null ? `${stats.averageRating} ★` : "—"}
          tone="text-amber-500"
        />
      </div>

      {/* Document vault */}
      <div className="card p-6 mt-6">
        <h2 className="font-bold mb-1">خزانة المستندات</h2>
        <p className="text-xs text-slate-500 mb-4">
          ما رفعه العميل مرة واحدة ويُعاد استخدامه تلقائياً في معاملاته. تُعرض البيانات الوصفية فقط — لفتح ملف، ادخل على المعاملة التي يخصّها.
        </p>
        {vaultDocuments.length === 0 ? (
          <p className="text-sm text-slate-500">لم يرفع هذا العميل أي مستند في خزانته بعد.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {vaultDocuments.map((doc) => {
              const remaining = doc.expiresAt ? Math.ceil((new Date(doc.expiresAt).getTime() - Date.now()) / 86400000) : null;
              const expired = remaining !== null && remaining < 0;
              const expiringSoon = remaining !== null && remaining >= 0 && remaining <= EXPIRY_WARNING_DAYS;
              return (
                <div
                  key={doc.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{doc.docType}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {doc.uploadedAt ? `رُفع في ${fmt(doc.uploadedAt)}` : "لم يُرفع بعد"}
                      {doc.expiresAt && ` · ينتهي في ${fmt(doc.expiresAt)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {expired && <span className="text-xs font-semibold text-red-600">منتهي</span>}
                    {expiringSoon && <span className="text-xs font-semibold text-amber-600">ينتهي خلال {remaining} يوم</span>}
                    <span className={`text-xs font-semibold ${DOC_STATUS_STYLES[doc.status]}`}>
                      {DOC_STATUS_LABELS[doc.status]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Full request history */}
      <div className="card p-6 mt-6">
        <h2 className="font-bold mb-4">سجل المعاملات ({operations.length})</h2>
        {operations.length === 0 ? (
          <p className="text-sm text-slate-500">لا توجد معاملات لهذا العميل بعد.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {operations.map((op) => (
              <Link
                key={op.id}
                to={`/operations/${op.id}`}
                className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 hover:border-brand/50 transition block"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{op.service.nameAr}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {fmt(op.createdAt)} · الخطوة {op.currentStep}/{op.totalSteps} · {op._count.documents} مستند
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {op.delayed && <span className="text-xs font-semibold text-orange-600">متأخرة</span>}
                    <span className="text-xs tabular-nums text-slate-500">
                      {Number(op.feeAmountSar)} ريال {op.feePaid ? "✓" : "(غير مدفوع)"}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[op.status] ?? ""}`}>
                      {STATUS_LABELS[op.status] ?? op.status}
                    </span>
                  </div>
                </div>
                {op.feedback.length > 0 && (
                  <p className="mt-2 text-xs text-amber-600">
                    {"★".repeat(op.feedback[0].rating)}
                    {op.feedback[0].comment ? ` — ${op.feedback[0].comment}` : ""}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Support thread */}
      {supportRequests.length > 0 && (
        <div className="card p-6 mt-6">
          <h2 className="font-bold mb-4">رسائل الدعم ({supportRequests.length})</h2>
          <div className="flex flex-col gap-3">
            {supportRequests.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-semibold ${
                      r.status === "ANSWERED" ? "text-green-600" : r.status === "CLOSED" ? "text-slate-400" : "text-amber-600"
                    }`}
                  >
                    {r.status === "ANSWERED" ? "تم الرد" : r.status === "CLOSED" ? "مغلقة" : "مفتوحة"}
                  </span>
                  <span className="text-xs text-slate-400">{fmt(r.createdAt)}</span>
                </div>
                <p className="text-sm">{r.message}</p>
                {r.ownerReply && (
                  <div className="mt-2 rounded-lg bg-brand/5 p-2.5 text-sm">
                    <p className="text-xs font-semibold text-brand mb-0.5">رد الفريق</p>
                    <p>{r.ownerReply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
