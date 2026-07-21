import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import { api, apiErrorMessage } from "../lib/api";
import { useAuthStore } from "../store/auth";
import { Operation } from "../types";
import { FeedbackModal } from "../components/FeedbackModal";

export default function OperationDetail() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "ar";
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  function formatExpectedCompletion(iso: string): string {
    const target = new Date(iso);
    const now = new Date();
    const diffMs = target.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / 86400000);

    const dateLabel = target.toLocaleDateString(lang === "en" ? "en-US" : "ar-SA", { day: "numeric", month: "long", year: "numeric" });
    if (diffDays <= 0) return t("operationDetail.dueTodayOrLess", { date: dateLabel });
    if (diffDays === 1) return t("operationDetail.dueOneDay", { date: dateLabel });
    return t("operationDetail.dueInDays", { date: dateLabel, days: diffDays });
  }

  const { data, isLoading, error: loadError, refetch } = useQuery({
    queryKey: ["operation", id],
    queryFn: async () => (await api.get(`/operations/${id}`)).data as { operation: Operation },
    enabled: !!id,
    retry: false,
  });

  const { data: meData } = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/auth/me")).data as { user: { creditSar: string } },
  });

  const operation = data?.operation;
  const isOwnerOrExpert = user?.role === "OWNER" || user?.role === "EXPERT";
  const allStepsDone = operation?.steps.every((s) => s.status === "DONE") ?? false;
  const canCancel =
    !!operation &&
    operation.status !== "COMPLETED" &&
    operation.status !== "CANCELLED" &&
    (user?.role === "OWNER" || operation.userId === user?.id);

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

  async function handleCancel() {
    setBusy(true);
    setError("");
    try {
      await api.post(`/operations/${id}/cancel`, { reason: cancelReason.trim() || undefined });
      setShowCancelConfirm(false);
      setCancelReason("");
      await refresh();
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
      formData.append("language", lang);
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

  // One-click, dependency-free case-summary export. Instead of a client-side
  // PDF library (pdfmake/jsPDF), which cannot shape Arabic letters correctly
  // and would need embedded fonts + a reshaper, we build a self-contained,
  // print-optimised HTML document and hand it to the browser's own print
  // engine ("Save as PDF"). The browser shapes Arabic perfectly, keeps the
  // text selectable, and produces a small file - no new npm dependency and no
  // risk to the Vercel build. All labels are inlined bilingually (mirroring
  // the lang-conditional pattern already used for service/step titles) so no
  // locale JSON has to change.
  function handleExportPdf() {
    if (!operation) return;
    const isEn = lang === "en";
    const L = (ar: string, en: string) => (isEn ? en : ar);
    const svcName = isEn && operation.service.nameEn ? operation.service.nameEn : operation.service.nameAr;

    const esc = (s: string) =>
      String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const statusLabels: Record<string, [string, string]> = {
      PENDING_PAYMENT: ["بانتظار الدفع", "Pending payment"],
      DOCS_REQUIRED: ["مستندات مطلوبة", "Documents required"],
      IN_PROGRESS: ["قيد التنفيذ", "In progress"],
      DELAYED: ["متأخرة", "Delayed"],
      ESCALATED_TO_EXPERT: ["محوّلة إلى خبير", "Escalated to expert"],
      COMPLETED: ["مكتملة", "Completed"],
      CANCELLED: ["ملغاة", "Cancelled"],
    };
    const stepStatusLabels: Record<string, [string, string]> = {
      PENDING: ["بانتظار", "Pending"],
      IN_PROGRESS: ["قيد التنفيذ", "In progress"],
      DONE: ["مكتمل", "Done"],
    };
    const docStatusLabels: Record<string, [string, string]> = {
      PENDING: ["لم يُرفع", "Not uploaded"],
      UPLOADED: ["قيد المراجعة", "Under review"],
      VERIFIED: ["موثّق", "Verified"],
      REJECTED: ["مرفوض", "Rejected"],
    };
    const pick = (pair: [string, string] | undefined, fallback: string) => (pair ? (isEn ? pair[1] : pair[0]) : fallback);

    const fmtDate = (iso: string) =>
      new Date(iso).toLocaleDateString(isEn ? "en-US" : "ar-SA", { day: "numeric", month: "long", year: "numeric" });
    const sar = (v: string | number) => `${Number(v).toLocaleString(isEn ? "en-US" : "ar-SA")} ${L("ر.س", "SAR")}`;

    const dir = isEn ? "ltr" : "rtl";
    const align = isEn ? "left" : "right";

    const stepsRows = operation.steps
      .map((s) => {
        const title = isEn && s.titleEn ? s.titleEn : s.titleAr;
        return `<tr><td class="num">${s.stepNumber}</td><td>${esc(title)}</td><td>${esc(pick(stepStatusLabels[s.status], s.status))}</td></tr>`;
      })
      .join("");

    const docsRows = operation.documents.length
      ? operation.documents
          .map((d) => `<tr><td>${esc(d.docType)}</td><td>${esc(pick(docStatusLabels[d.status], d.status))}</td></tr>`)
          .join("")
      : `<tr><td colspan="2" class="muted">${L("لا توجد مستندات", "No documents")}</td></tr>`;

    const credit = Number(operation.creditAppliedSar);
    const gov = Number(operation.govFeeEstimateSar);

    const html = `<!doctype html>
<html dir="${dir}" lang="${isEn ? "en" : "ar"}">
<head>
<meta charset="utf-8" />
<title>${L("ملخّص العملية", "Case summary")} - ${esc(operation.id.slice(0, 8))}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #1e293b; margin: 0; padding: 32px; direction: ${dir}; text-align: ${align}; }
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #0f766e; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 26px; font-weight: 800; color: #0f766e; }
  .brand small { display: block; font-size: 12px; font-weight: 500; color: #64748b; margin-top: 4px; }
  .doc-title { font-size: 18px; font-weight: 700; color: #334155; }
  h2 { font-size: 15px; color: #0f766e; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin: 24px 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: ${align}; }
  th { background: #f1f5f9; font-weight: 700; }
  td.num { width: 40px; text-align: center; color: #64748b; }
  td.muted, .muted { color: #94a3b8; text-align: center; }
  table.meta td { border: none; padding: 4px 0; font-size: 13px; }
  table.meta td:first-child { color: #64748b; width: 190px; }
  table.meta td:last-child { font-weight: 600; }
  table.fees td:last-child { font-weight: 700; }
  .note { font-size: 11px; color: #64748b; margin-top: 8px; line-height: 1.7; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; line-height: 1.7; }
  @page { margin: 18mm; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">${L("ميسوور", "Mysorat")}<small>${L("مستشارك للخدمات الحكومية", "Your government services advisor")}</small></div>
    <div class="doc-title">${L("ملخّص العملية", "Case summary")}</div>
  </div>

  <table class="meta">
    <tr><td>${L("رقم العملية", "Operation number")}</td><td>${esc(operation.id)}</td></tr>
    <tr><td>${L("الخدمة", "Service")}</td><td>${esc(svcName)}</td></tr>
    <tr><td>${L("التصنيف", "Category")}</td><td>${esc(operation.service.category)}</td></tr>
    <tr><td>${L("الحالة", "Status")}</td><td>${esc(pick(statusLabels[operation.status], operation.status))}</td></tr>
    <tr><td>${L("الخطوة الحالية", "Current step")}</td><td>${operation.currentStep} / ${operation.totalSteps}</td></tr>
    <tr><td>${L("تاريخ الإنشاء", "Created on")}</td><td>${fmtDate(operation.createdAt)}</td></tr>
  </table>

  <h2>${L("خطوات الإجراء", "Process steps")}</h2>
  <table>
    <thead><tr><th class="num">#</th><th>${L("الخطوة", "Step")}</th><th>${L("الحالة", "Status")}</th></tr></thead>
    <tbody>${stepsRows}</tbody>
  </table>

  <h2>${L("المستندات", "Documents")}</h2>
  <table>
    <thead><tr><th>${L("المستند", "Document")}</th><th>${L("الحالة", "Status")}</th></tr></thead>
    <tbody>${docsRows}</tbody>
  </table>

  <h2>${L("الرسوم", "Fees")}</h2>
  <table class="meta fees">
    <tr><td>${L("رسوم ميسوور", "Mysorat fee")}</td><td>${sar(operation.feeAmountSar)}</td></tr>
    ${credit > 0 ? `<tr><td>${L("رصيد مطبّق", "Credit applied")}</td><td>- ${sar(credit)}</td></tr>` : ""}
    ${gov > 0 ? `<tr><td>${L("رسوم حكومية تقديرية", "Estimated government fee")}</td><td>${sar(gov)}</td></tr>` : ""}
  </table>
  ${
    gov > 0
      ? `<p class="note">${L(
          "الرسوم الحكومية التقديرية تُدفع مباشرة للجهة الحكومية عبر بوابتها الرسمية، ولا تحصّلها ميسوور.",
          "The estimated government fee is paid directly to the government agency through its official portal; Mysorat does not collect it."
        )}</p>`
      : ""
  }

  <div class="footer">
    <p>${L("تاريخ إصدار هذا الملخّص", "Summary generated on")}: ${fmtDate(new Date().toISOString())}</p>
    <p>${L(
      "هذا الملخّص وثيقة معلوماتية صادرة عن منصة ميسوور لمتابعة إجراءك، وليس مستنداً حكومياً رسمياً.",
      "This summary is an informational document issued by Mysorat to track your transaction. It is not an official government document."
    )}</p>
  </div>

  <script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},350);});window.onafterprint=function(){window.close();};</script>
</body>
</html>`;

    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) {
      setError(L("يرجى السماح بالنوافذ المنبثقة لتصدير الملف بصيغة PDF.", "Please allow pop-ups to export the PDF."));
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  if (isLoading) return <p className="text-center py-16 text-slate-500">{t("common.loading")}</p>;

  if (loadError) {
    // Distinguishing the failure reason matters here: a customer navigated
    // here right after the assistant just created this exact operation, so a
    // blanket "not found" message for what's actually a 401/403/500 would be
    // actively misleading about what went wrong.
    const status = axios.isAxiosError(loadError) ? loadError.response?.status : undefined;
    const message =
      status === 403
        ? t("operationDetail.accessDenied")
        : status === 404
        ? t("operationDetail.notFound")
        : apiErrorMessage(loadError);
    return (
      <div className="text-center py-16">
        <p className="text-slate-500 mb-4">{message}</p>
        {status !== 403 && status !== 404 && (
          <button className="btn-secondary" onClick={() => refetch()}>{t("common.retry")}</button>
        )}
      </div>
    );
  }

  if (!operation) return <p className="text-center py-16 text-slate-500">{t("operationDetail.notFound")}</p>;

  const needsFeedback = allStepsDone && operation.status !== "COMPLETED" && operation.userId === user?.id;
  const serviceName = lang === "en" && operation.service.nameEn ? operation.service.nameEn : operation.service.nameAr;

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

      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-center mb-2">{t("operationDetail.cancelConfirmTitle")}</h2>
            <p className="text-sm text-slate-500 text-center mb-4">{t("operationDetail.cancelConfirmDesc")}</p>
            <textarea
              className="input mb-4"
              rows={3}
              placeholder={t("operationDetail.cancelReasonPlaceholder")}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                className="btn-secondary flex-1"
                onClick={() => {
                  setShowCancelConfirm(false);
                  setCancelReason("");
                }}
                disabled={busy}
              >
                {t("operationDetail.keepTransaction")}
              </button>
              <button className="btn-primary flex-1 !bg-none !bg-red-600 hover:!bg-red-700" onClick={handleCancel} disabled={busy}>
                {t("operationDetail.confirmCancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold">{serviceName}</h1>
        {canCancel && (
          <button
            className="text-xs font-semibold text-red-600 hover:underline shrink-0"
            onClick={() => setShowCancelConfirm(true)}
          >
            {t("operationDetail.cancelTransaction")}
          </button>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-6">{t("operationDetail.operationNumber", { id: operation.id.slice(0, 8) })}</p>

      {error && <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{error}</p>}

      {operation.status === "CANCELLED" && (
        <div className="card p-4 mb-6 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40">
          <p className="text-red-700 dark:text-red-300 font-semibold">{t("operationDetail.cancelledNotice")}</p>
          {operation.cancelReason && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{t("operationDetail.cancelledReasonLabel", { reason: operation.cancelReason })}</p>
          )}
        </div>
      )}

      {!allStepsDone && operation.status !== "CANCELLED" && (
        <div
          className={`card p-4 mb-6 text-sm ${
            operation.delayed ? "border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/40" : ""
          }`}
        >
          {operation.delayed ? (
            <p className="text-orange-700 dark:text-orange-300">
              {t("operationDetail.delayedNotice", { reason: operation.delayReason ? `: ${operation.delayReason}` : "" })}
            </p>
          ) : operation.expectedCompletionAt ? (
            <p className="text-slate-600 dark:text-slate-300">
              {t("operationDetail.expectedCompletion", { date: formatExpectedCompletion(operation.expectedCompletionAt) })}
            </p>
          ) : null}
        </div>
      )}

      {!operation.feePaid && operation.status !== "CANCELLED" && (() => {
        const availableCredit = Number(meData?.user.creditSar ?? 0);
        const creditPreview = Math.min(availableCredit, Number(operation.feeAmountSar));
        const dueAfterCredit = Number(operation.feeAmountSar) - creditPreview;
        return (
          <div className="card p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{t("operationDetail.mysoratFee")}</p>
                <p className="text-sm text-slate-500">{t("operationDetail.mysoratFeeDesc")}</p>
              </div>
              <div className="flex items-center gap-3">
                {creditPreview > 0 ? (
                  <span className="text-left">
                    <span className="block text-xs text-slate-400 line-through">{t("operationDetail.sarAmount", { amount: operation.feeAmountSar })}</span>
                    <span className="block text-brand font-bold text-lg">{t("operationDetail.sarAmount", { amount: dueAfterCredit })}</span>
                  </span>
                ) : (
                  <span className="text-brand font-bold text-lg">{t("operationDetail.sarAmount", { amount: operation.feeAmountSar })}</span>
                )}
                <button className="btn-primary" onClick={handlePay} disabled={busy}>{t("operationDetail.payNow")}</button>
              </div>
            </div>
            {creditPreview > 0 && (
              <p className="mt-3 text-xs text-brand">{t("operationDetail.creditPreview", { amount: creditPreview })}</p>
            )}
            {Number(operation.govFeeEstimateSar) > 0 && (
              <p className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-500">
                {t("operationDetail.govFeeNotice", { amount: operation.govFeeEstimateSar })}
              </p>
            )}
          </div>
        );
      })()}

      {operation.feePaid && Number(operation.creditAppliedSar) > 0 && (
        <p className="mb-6 -mt-3 text-xs text-brand">{t("operationDetail.creditApplied", { amount: operation.creditAppliedSar })}</p>
      )}

      {operation.feePaid && operation.documents.length > 0 && (
        <div className="card p-6 mb-6">
          <h2 className="font-bold mb-4">{t("operationDetail.requiredDocuments")}</h2>
          <div className="flex flex-col gap-3">
            {operation.documents.map((doc) => (
              <div key={doc.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">{doc.docType}</span>
                  <div className="flex items-center gap-2">
                    {doc.status === "VERIFIED" && <span className="text-xs font-semibold text-green-600">{t("operationDetail.verified")}</span>}
                    {doc.status === "UPLOADED" && <span className="text-xs font-semibold text-amber-600">{t("operationDetail.underReview")}</span>}
                    {doc.status === "REJECTED" && <span className="text-xs font-semibold text-red-600">{t("operationDetail.rejected")}</span>}
                    {doc.fileUrl && (
                      <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => handleView(doc.id)}>
                        {t("operationDetail.viewFile")}
                      </button>
                    )}
                    {doc.status !== "VERIFIED" && operation.status !== "CANCELLED" && (
                      <label className="btn-secondary !px-3 !py-1.5 text-xs cursor-pointer">
                        {doc.status === "REJECTED" ? t("operationDetail.reupload") : t("operationDetail.uploadFile")}
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
                  <p className="mt-2 text-xs text-red-600">{t("operationDetail.reasonLabel", { reason: doc.verificationNote })}</p>
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
        <h2 className="font-bold mb-4">{t("operationDetail.processTitle", { current: operation.currentStep, total: operation.totalSteps })}</h2>
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
                <p className="text-sm">{lang === "en" && step.titleEn ? step.titleEn : step.titleAr}</p>
                {isOwnerOrExpert && step.status === "DONE" && (
                  <p className="text-xs text-slate-400">
                    {step.executedBy === "AUTO" ? t("operationDetail.executedAuto") : t("operationDetail.executedExpert")}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>

        {operation.feePaid && !allStepsDone && operation.status !== "CANCELLED" && (
          <button className="btn-primary mt-6 w-full" onClick={() => handleAdvance()} disabled={busy}>
            {isOwnerOrExpert ? t("operationDetail.completeStepManually") : t("operationDetail.checkLatestUpdate")}
          </button>
        )}

        {operation.status === "ESCALATED_TO_EXPERT" && (
          <p className="mt-4 rounded-lg bg-purple-50 dark:bg-purple-950 p-3 text-sm text-purple-700 dark:text-purple-300">
            {operation.userId === user?.id
              ? t("operationDetail.escalatedToCustomer")
              : t("operationDetail.escalatedToOther")}
          </p>
        )}

        {user?.role === "OWNER" && !allStepsDone && operation.status !== "ESCALATED_TO_EXPERT" && operation.status !== "CANCELLED" && (
          <div className="mt-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4">
            <p className="text-sm font-semibold mb-2">{t("operationDetail.escalatePrompt")}</p>
            <div className="flex gap-2">
              <select
                className="input !py-2 text-sm"
                value={selectedExpertId}
                onChange={(e) => setSelectedExpertId(e.target.value)}
              >
                <option value="">{t("operationDetail.chooseExpert")}</option>
                {expertsData?.experts.map((e) => (
                  <option key={e.id} value={e.id}>{e.user.email} {e.specialty ? `— ${e.specialty}` : ""}</option>
                ))}
              </select>
              <button className="btn-secondary !px-4 text-sm" onClick={handleEscalate} disabled={busy || !selectedExpertId}>
                {t("operationDetail.transfer")}
              </button>
            </div>
          </div>
        )}
      </div>

      {operation.status === "COMPLETED" && (
        <div className="card p-6 mt-6 text-center">
          <p className="text-green-600 font-bold text-lg">{t("operationDetail.completedSuccessfully")}</p>
          <button className="btn-secondary mt-4" onClick={handleExportPdf}>
            {lang === "en" ? "Export PDF summary" : "تصدير ملخّص PDF"}
          </button>
        </div>
      )}
    </div>
  );
}
