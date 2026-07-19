import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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

  const { data, isLoading } = useQuery({
    queryKey: ["operation", id],
    queryFn: async () => (await api.get(`/operations/${id}`)).data as { operation: Operation },
    enabled: !!id,
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

  if (isLoading) return <p className="text-center py-16 text-slate-500">{t("common.loading")}</p>;
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
        </div>
      )}
    </div>
  );
}
