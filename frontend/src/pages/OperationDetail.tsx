import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, apiErrorMessage } from "../lib/api";
import { useAuthStore } from "../store/auth";
import { Operation } from "../types";
import { FeedbackModal } from "../components/FeedbackModal";

function formatExpectedCompletion(iso: string): string {
  const target = new Date(iso);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / 86400000);

  const dateLabel = target.toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" });
  if (diffDays <= 0) return `${dateLabel} (اليوم أو أقل)`;
  if (diffDays === 1) return `${dateLabel} (يوم واحد تقريباً)`;
  return `${dateLabel} (خلال ${diffDays} أيام تقريباً)`;
}

export default function OperationDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["operation", id],
    queryFn: async () => (await api.get(`/operations/${id}`)).data as { operation: Operation },
    enabled: !!id,
  });

  const operation = data?.operation;
  const isOwnerOrExpert = user?.role === "OWNER" || user?.role === "EXPERT";
  const allStepsDone = operation?.steps.every((s) => s.status === "DONE") ?? false;

  const { data: expertsData } = useQuery({
    queryKey: ["experts-for-escalation"],
    queryFn: async () => (await api.get("/admin/experts")).data as { experts: { id: string; specialty: string | null; user: { email: string } }[] },
    enabled: user?.role === "OWNER",
  });
  const [selectedExpertId, setSelectedExpertId] = useState("");

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["operation", id] });
  }

  async function handlePay() {
    setBusy(true);
    setError("");
    try {
      await api.post(`/operations/${id}/pay`);
      await refresh();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleAdvance(note?: string) {
    setBusy(true);
    setError("");
    try {
      const res = await api.post(`/operations/${id}/advance`, { note });
      await refresh();
      if (res.data.allStepsDone && operation?.userId === user?.id) {
        setShowFeedback(true);
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleEscalate() {
    if (!selectedExpertId) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/operations/${id}/escalate`, { expertId: selectedExpertId });
      await refresh();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(docId: string, file: File) {
    setBusy(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.post(`/operations/${id}/documents/${docId}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await refresh();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleView(docId: string) {
    setError("");
    try {
      const res = await api.get(`/operations/${id}/documents/${docId}/download`);
      const url = res.data.url as string;
      window.open(url.startsWith("/") ? `${api.defaults.baseURL?.replace(/\/api$/, "")}${url}` : url, "_blank");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  if (isLoading) return <p className="text-center py-16 text-slate-500">جارِ التحميل...</p>;
  if (!operation) return <p className="text-center py-16 text-slate-500">العملية غير موجودة</p>;

  const needsFeedback = allStepsDone && operation.status !== "COMPLETED" && operation.userId === user?.id;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {(showFeedback || needsFeedback) && operation && (
        <FeedbackModal
          operationId={operation.id}
          onDone={async () => {
            await refresh();
            setShowFeedback(false);
          }}
        />
      )}

      <h1 className="text-2xl font-bold mb-1">{operation.service.nameAr}</h1>
      <p className="text-sm text-slate-500 mb-6">رقم العملية: {operation.id.slice(0, 8)}</p>

      {error && <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{error}</p>}

      {!allStepsDone && operation.status !== "CANCELLED" && (
        <div
          className={`card p-4 mb-6 text-sm ${
            operation.delayed ? "border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/40" : ""
          }`}
        >
          {operation.delayed ? (
            <p className="text-orange-700 dark:text-orange-300">
              ⏳ نعتذر، معاملتك تأخرت قليلاً عن الوقت المتوقع
              {operation.delayReason ? `: ${operation.delayReason}` : ""}. نحن نتابعها لإنجازها بأسرع وقت وبنفس الجودة.
            </p>
          ) : operation.expectedCompletionAt ? (
            <p className="text-slate-600 dark:text-slate-300">
              ⏱ الوقت المتوقع لإنجاز معاملتك: {formatExpectedCompletion(operation.expectedCompletionAt)}
            </p>
          ) : null}
        </div>
      )}

      {!operation.feePaid && (
        <div className="card p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">رسوم خدمة ميسوور</p>
              <p className="text-sm text-slate-500">أجر المتابعة والمساعدة الذكية، يُدفع لمنصة ميسوور فقط</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-brand font-bold text-lg">{operation.feeAmountSar} ريال</span>
              <button className="btn-primary" onClick={handlePay} disabled={busy}>ادفع الآن</button>
            </div>
          </div>
          {Number(operation.govFeeEstimateSar) > 0 && (
            <p className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-500">
              ملاحظة: هذه الخدمة قد تتطلب أيضاً رسوماً حكومية تقديرية بقيمة {operation.govFeeEstimateSar} ريال، وهي منفصلة تماماً عن رسوم ميسوور ولا تُدفع هنا — تُسدَّد مباشرة عبر المنصة الحكومية الرسمية عند تنفيذ الخطوة.
            </p>
          )}
        </div>
      )}

      {operation.feePaid && operation.documents.length > 0 && (
        <div className="card p-6 mb-6">
          <h2 className="font-bold mb-4">المستندات المطلوبة</h2>
          <div className="flex flex-col gap-3">
            {operation.documents.map((doc) => (
              <div key={doc.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">{doc.docType}</span>
                  <div className="flex items-center gap-2">
                    {doc.status === "VERIFIED" && <span className="text-xs font-semibold text-green-600">✓ تم التحقق</span>}
                    {doc.status === "UPLOADED" && <span className="text-xs font-semibold text-amber-600">قيد المراجعة</span>}
                    {doc.status === "REJECTED" && <span className="text-xs font-semibold text-red-600">✕ مرفوض</span>}
                    {doc.fileUrl && (
                      <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => handleView(doc.id)}>
                        عرض الملف
                      </button>
                    )}
                    {doc.status !== "VERIFIED" && (
                      <label className="btn-secondary !px-3 !py-1.5 text-xs cursor-pointer">
                        {doc.status === "REJECTED" ? "إعادة الرفع" : "رفع الملف"}
                        <input
                          type="file"
                          className="hidden"
                          accept="application/pdf,image/*"
                          onChange={(e) => e.target.files?.[0] && handleUpload(doc.id, e.target.files[0])}
                        />
                      </label>
                    )}
                  </div>
                </div>
                {doc.status === "REJECTED" && doc.verificationNote && (
                  <p className="mt-2 text-xs text-red-600">السبب: {doc.verificationNote}</p>
                )}
                {doc.status === "UPLOADED" && doc.verificationNote && (
                  <p className="mt-2 text-xs text-amber-600">{doc.verificationNote}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-6">
        <h2 className="font-bold mb-4">سير العملية — الخطوة {operation.currentStep} من {operation.totalSteps}</h2>
        <ol className="flex flex-col gap-3">
          {operation.steps.map((step) => (
            <li key={step.id} className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  step.status === "DONE"
                    ? "bg-green-500 text-white"
                    : step.status === "IN_PROGRESS"
                    ? "bg-brand text-white"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-500"
                }`}
              >
                {step.status === "DONE" ? "✓" : step.stepNumber}
              </span>
              <div className="flex-1">
                <p className="text-sm">{step.titleAr}</p>
                {isOwnerOrExpert && step.status === "DONE" && (
                  <p className="text-xs text-slate-400">نُفّذت {step.executedBy === "AUTO" ? "تلقائياً" : "بواسطة خبير"}</p>
                )}
              </div>
            </li>
          ))}
        </ol>

        {operation.feePaid && !allStepsDone && (
          <button className="btn-primary mt-6 w-full" onClick={() => handleAdvance()} disabled={busy}>
            {isOwnerOrExpert ? "إكمال الخطوة التالية يدوياً" : "تحقق من آخر تحديث"}
          </button>
        )}

        {operation.status === "ESCALATED_TO_EXPERT" && (
          <p className="mt-4 rounded-lg bg-purple-50 dark:bg-purple-950 p-3 text-sm text-purple-700 dark:text-purple-300">
            {operation.userId === user?.id
              ? "تم تحويل معاملتك إلى خبير مختص لإكمال الإجراء يدوياً، سيتم إعلامك بأي تحديث."
              : `تم تحويل هذه العملية إلى خبير مختص.`}
          </p>
        )}

        {user?.role === "OWNER" && !allStepsDone && operation.status !== "ESCALATED_TO_EXPERT" && (
          <div className="mt-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4">
            <p className="text-sm font-semibold mb-2">تعثرت الأتمتة؟ حوّل العملية لخبير مختص</p>
            <div className="flex gap-2">
              <select
                className="input !py-2 text-sm"
                value={selectedExpertId}
                onChange={(e) => setSelectedExpertId(e.target.value)}
              >
                <option value="">اختر خبيراً...</option>
                {expertsData?.experts.map((e) => (
                  <option key={e.id} value={e.id}>{e.user.email} {e.specialty ? `— ${e.specialty}` : ""}</option>
                ))}
              </select>
              <button className="btn-secondary !px-4 text-sm" onClick={handleEscalate} disabled={busy || !selectedExpertId}>
                تحويل
              </button>
            </div>
          </div>
        )}
      </div>

      {operation.status === "COMPLETED" && (
        <div className="card p-6 mt-6 text-center">
          <p className="text-green-600 font-bold text-lg">✓ تم إنجاز المعاملة بنجاح</p>
        </div>
      )}
    </div>
  );
}
