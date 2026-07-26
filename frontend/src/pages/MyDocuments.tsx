import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, apiErrorMessage } from "../lib/api";
import { Sidebar } from "../components/Sidebar";

interface VaultDocument {
  id: string;
  docType: string;
  fileUrl: string | null;
  status: "PENDING" | "UPLOADED" | "VERIFIED" | "REJECTED";
  verificationNote: string | null;
  expiresAt: string | null;
  uploadedAt: string | null;
}

interface DocTypeOption {
  docType: string;
  serviceCount: number;
}

/** Days before expiry at which a document is shown as "expiring soon". */
const EXPIRY_WARNING_DAYS = 30;

/**
 * Classify an expiry date. Deliberately decides "expired" from the raw
 * millisecond delta rather than the rounded day count: Math.ceil() of a small
 * negative number returns -0, and -0 < 0 is false, so rounding first would
 * show a document that lapsed hours ago as an amber "expires in 0 days"
 * instead of a red "expired" for a whole day after it stopped being valid.
 */
function expiryState(iso: string): { expired: boolean; expiringSoon: boolean; daysLeft: number } {
  const ms = new Date(iso).getTime() - Date.now();
  const expired = ms < 0;
  const daysLeft = Math.max(0, Math.ceil(ms / 86400000));
  return { expired, expiringSoon: !expired && daysLeft <= EXPIRY_WARNING_DAYS, daysLeft };
}

export default function MyDocuments() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "ar";
  const locale = lang === "en" ? "en-US" : "ar-SA";
  const queryClient = useQueryClient();

  const [error, setError] = useState("");
  // A Set, not a single value: two uploads can legitimately overlap, and a
  // single string would let the first one to finish clear the busy flag while
  // the second is still in flight.
  const [busyDocTypes, setBusyDocTypes] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const [selectedDocType, setSelectedDocType] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  // isError matters as much as the data here: without it a failed request
  // falls back to an empty array and the page cheerfully reports "your vault
  // is empty" (or worse, "you've added every document type") when what really
  // happened was a 500. That is the exact class of bug where a server error
  // gets disguised as a benign empty state.
  const { data, isLoading, isError, error: listError, refetch } = useQuery({
    queryKey: ["vault"],
    queryFn: async () => (await api.get("/vault")).data as { documents: VaultDocument[] },
  });

  const { data: docTypeData, isError: isDocTypesError } = useQuery({
    queryKey: ["vault-doc-types"],
    queryFn: async () => (await api.get("/vault/doc-types")).data as { docTypes: DocTypeOption[] },
  });

  const documents = data?.documents ?? [];
  const stored = new Set(documents.map((d) => d.docType));
  // Only offer types the customer hasn't stored yet - re-uploading an existing
  // one is done from its own card, which keeps the two actions distinct.
  const available = (docTypeData?.docTypes ?? []).filter((o) => !stored.has(o.docType));

  function setBusy(docType: string, busy: boolean) {
    setBusyDocTypes((prev) => {
      const next = new Set(prev);
      if (busy) next.add(docType);
      else next.delete(docType);
      return next;
    });
  }

  async function upload(docType: string, file: File, expiry?: string) {
    setBusy(docType, true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("language", lang === "en" ? "en" : "ar");
      if (expiry) form.append("expiresAt", new Date(expiry).toISOString());
      const res = await api.post(`/vault/${encodeURIComponent(docType)}`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      // The backend also back-fills any open request that was waiting on this
      // exact document - worth telling the customer, since it means they have
      // nothing left to do there.
      const applied = (res.data?.appliedToOperations as number | undefined) ?? 0;
      if (applied > 0) setNotice(t("myDocuments.appliedToOperations", { count: applied }));
      await queryClient.invalidateQueries({ queryKey: ["vault"] });
      // An operation's documents may have just changed too.
      await queryClient.invalidateQueries({ queryKey: ["operations"] });
      setSelectedDocType("");
      setExpiresAt("");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(docType, false);
    }
  }

  async function view(id: string) {
    setError("");
    try {
      const res = await api.get(`/vault/${id}/download`);
      const url = res.data.url as string;
      window.open(url.startsWith("/") ? `${api.defaults.baseURL?.replace(/\/api$/, "")}${url}` : url, "_blank");
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function remove(doc: VaultDocument) {
    if (!window.confirm(t("myDocuments.confirmDelete", { docType: doc.docType }))) return;
    setError("");
    try {
      await api.delete(`/vault/${doc.id}`);
      await queryClient.invalidateQueries({ queryKey: ["vault"] });
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  function statusBadge(doc: VaultDocument) {
    if (doc.status === "VERIFIED") {
      return <span className="text-xs font-semibold text-green-600">{t("myDocuments.statusVerified")}</span>;
    }
    if (doc.status === "UPLOADED") {
      return <span className="text-xs font-semibold text-amber-600">{t("myDocuments.statusUnderReview")}</span>;
    }
    if (doc.status === "REJECTED") {
      return <span className="text-xs font-semibold text-red-600">{t("myDocuments.statusRejected")}</span>;
    }
    return <span className="text-xs font-semibold text-slate-400">{t("myDocuments.statusPending")}</span>;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 flex gap-6 items-start">
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-bold">{t("myDocuments.title")}</h1>
        <p className="text-slate-500 text-sm mt-0.5 mb-6">{t("myDocuments.subtitle")}</p>

        {error && <p className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600 mb-4">{error}</p>}
        {notice && <p className="rounded-lg bg-green-50 dark:bg-green-950 p-3 text-sm text-green-700 dark:text-green-400 mb-4">{notice}</p>}

        <div className="card p-6 mb-6">
          <h2 className="font-bold mb-1">{t("myDocuments.addTitle")}</h2>
          <p className="text-xs text-slate-500 mb-4">{t("myDocuments.addHint")}</p>

          {isDocTypesError ? (
            <p className="text-sm text-red-600">{t("myDocuments.docTypesUnavailable")}</p>
          ) : available.length === 0 ? (
            <p className="text-sm text-slate-500">{t("myDocuments.allStored")}</p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                <span className="text-slate-600 dark:text-slate-300">{t("myDocuments.docTypeLabel")}</span>
                <select className="input" value={selectedDocType} onChange={(e) => setSelectedDocType(e.target.value)}>
                  <option value="">{t("myDocuments.docTypePlaceholder")}</option>
                  {available.map((o) => (
                    <option key={o.docType} value={o.docType}>
                      {t("myDocuments.docTypeOption", { docType: o.docType, count: o.serviceCount })}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600 dark:text-slate-300">{t("myDocuments.expiryLabel")}</span>
                <input type="date" className="input" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </label>

              <label
                className={`btn-primary text-center ${
                  !selectedDocType || busyDocTypes.has(selectedDocType) ? "pointer-events-none opacity-50" : "cursor-pointer"
                }`}
              >
                {busyDocTypes.has(selectedDocType) ? t("myDocuments.uploading") : t("myDocuments.chooseFile")}
                <input
                  type="file"
                  className="hidden"
                  accept="application/pdf,image/*"
                  disabled={!selectedDocType || busyDocTypes.has(selectedDocType)}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && selectedDocType) upload(selectedDocType, file, expiresAt || undefined);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          )}
        </div>

        {isLoading && <p className="text-slate-500">{t("common.loading")}</p>}

        {isError && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950 p-4 text-sm text-red-600">
            <p>{apiErrorMessage(listError)}</p>
            <button className="btn-secondary !px-3 !py-1.5 text-xs mt-3" onClick={() => refetch()}>
              {t("common.retry")}
            </button>
          </div>
        )}

        {!isLoading && !isError && documents.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-4xl mb-2" aria-hidden="true">📁</p>
            <p className="font-semibold">{t("myDocuments.emptyTitle")}</p>
            <p className="text-sm text-slate-500 mt-1">{t("myDocuments.emptyDesc")}</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {documents.map((doc) => {
            const expiry = doc.expiresAt ? expiryState(doc.expiresAt) : null;
            const expired = expiry?.expired ?? false;
            const expiringSoon = expiry?.expiringSoon ?? false;

            return (
              <div key={doc.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{doc.docType}</p>
                    {doc.uploadedAt && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {t("myDocuments.uploadedOn", { date: new Date(doc.uploadedAt).toLocaleDateString(locale) })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(doc)}
                    {doc.fileUrl && (
                      <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => view(doc.id)}>
                        {t("myDocuments.view")}
                      </button>
                    )}
                    <label className="btn-secondary !px-3 !py-1.5 text-xs cursor-pointer">
                      {busyDocTypes.has(doc.docType) ? t("myDocuments.uploading") : t("myDocuments.replace")}
                      <input
                        type="file"
                        className="hidden"
                        accept="application/pdf,image/*"
                        disabled={busyDocTypes.has(doc.docType)}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) upload(doc.docType, file, doc.expiresAt ?? undefined);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <button
                      className="btn-secondary !px-3 !py-1.5 text-xs !text-red-600"
                      onClick={() => remove(doc)}
                    >
                      {t("myDocuments.delete")}
                    </button>
                  </div>
                </div>

                {doc.expiresAt && (
                  <p
                    className={`mt-2 text-xs ${
                      expired ? "text-red-600 font-semibold" : expiringSoon ? "text-amber-600 font-semibold" : "text-slate-400"
                    }`}
                  >
                    {expired
                      ? t("myDocuments.expired", { date: new Date(doc.expiresAt).toLocaleDateString(locale) })
                      : expiringSoon
                      ? t("myDocuments.expiringSoon", { days: expiry?.daysLeft ?? 0 })
                      : t("myDocuments.expiresOn", { date: new Date(doc.expiresAt).toLocaleDateString(locale) })}
                  </p>
                )}

                {doc.status === "REJECTED" && doc.verificationNote && (
                  <p className="mt-2 text-xs text-red-600">{t("myDocuments.reasonLabel", { reason: doc.verificationNote })}</p>
                )}
                {doc.status === "UPLOADED" && doc.verificationNote && (
                  <p className="mt-2 text-xs text-amber-600">{doc.verificationNote}</p>
                )}
                {doc.status === "VERIFIED" && (
                  <p className="mt-2 text-xs text-green-600">{t("myDocuments.reusedHint")}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Sidebar />
    </div>
  );
}
