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

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

export default function MyDocuments() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "ar";
  const locale = lang === "en" ? "en-US" : "ar-SA";
  const queryClient = useQueryClient();

  const [error, setError] = useState("");
  const [busyDocType, setBusyDocType] = useState<string | null>(null);
  const [selectedDocType, setSelectedDocType] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["vault"],
    queryFn: async () => (await api.get("/vault")).data as { documents: VaultDocument[] },
  });

  const { data: docTypeData } = useQuery({
    queryKey: ["vault-doc-types"],
    queryFn: async () => (await api.get("/vault/doc-types")).data as { docTypes: DocTypeOption[] },
  });

  const documents = data?.documents ?? [];
  const stored = new Set(documents.map((d) => d.docType));
  // Only offer types the customer hasn't stored yet - re-uploading an existing
  // one is done from its own card, which keeps the two actions distinct.
  const available = (docTypeData?.docTypes ?? []).filter((o) => !stored.has(o.docType));

  async function upload(docType: string, file: File, expiry?: string) {
    setBusyDocType(docType);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("language", lang === "en" ? "en" : "ar");
      if (expiry) form.append("expiresAt", new Date(expiry).toISOString());
      await api.post(`/vault/${encodeURIComponent(docType)}`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await queryClient.invalidateQueries({ queryKey: ["vault"] });
      setSelectedDocType("");
      setExpiresAt("");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyDocType(null);
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

        <div className="card p-6 mb-6">
          <h2 className="font-bold mb-1">{t("myDocuments.addTitle")}</h2>
          <p className="text-xs text-slate-500 mb-4">{t("myDocuments.addHint")}</p>

          {available.length === 0 ? (
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
                  !selectedDocType || busyDocType ? "pointer-events-none opacity-50" : "cursor-pointer"
                }`}
              >
                {busyDocType ? t("myDocuments.uploading") : t("myDocuments.chooseFile")}
                <input
                  type="file"
                  className="hidden"
                  accept="application/pdf,image/*"
                  disabled={!selectedDocType || !!busyDocType}
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

        {!isLoading && documents.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-4xl mb-2" aria-hidden="true">📁</p>
            <p className="font-semibold">{t("myDocuments.emptyTitle")}</p>
            <p className="text-sm text-slate-500 mt-1">{t("myDocuments.emptyDesc")}</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {documents.map((doc) => {
            const remaining = doc.expiresAt ? daysUntil(doc.expiresAt) : null;
            const expired = remaining !== null && remaining < 0;
            const expiringSoon = remaining !== null && remaining >= 0 && remaining <= EXPIRY_WARNING_DAYS;

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
                      {busyDocType === doc.docType ? t("myDocuments.uploading") : t("myDocuments.replace")}
                      <input
                        type="file"
                        className="hidden"
                        accept="application/pdf,image/*"
                        disabled={busyDocType === doc.docType}
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
                      ? t("myDocuments.expiringSoon", { days: remaining })
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
