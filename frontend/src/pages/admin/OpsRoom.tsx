import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, apiErrorMessage } from "../../lib/api";

/**
 * "Ops Room" - the operator console. This is a separate, owner-only page that
 * sits alongside the existing admin dashboard rather than replacing it: nothing
 * the customer sees changes, and the owner keeps every screen they had before.
 *
 * Four tabs, in the order a one-person office actually works:
 *   الطابور        - what is blocking right now, triaged by cost of delay
 *   الموافقات      - Mysorat asks permission before taking on more, and reports back
 *   قاعدة المعرفة  - what the platform learned from this office's own history
 *   التجديدات      - finished work turned into predictable repeat revenue
 */

type Tab = "queue" | "approvals" | "playbooks" | "renewals";

interface QueueReason {
  code: string;
  labelAr: string;
  weight: number;
}
interface QueueItem {
  id: string;
  serviceNameAr: string;
  customerEmail: string;
  segment: string;
  status: string;
  feePaid: boolean;
  currentStep: number;
  totalSteps: number;
  ageDays: number;
  score: number;
  reasons: QueueReason[];
}
interface ApprovalItem {
  id: string;
  kind: "PLAYBOOK_PROPOSAL" | "PLAYBOOK_AUTONOMY" | "AUTO_ACTION_NOTICE";
  status: "PENDING" | "APPROVED" | "REJECTED" | "ACKNOWLEDGED";
  titleAr: string;
  summaryAr: string;
  createdAt: string;
}
interface PlaybookItem {
  id: string;
  serviceNameAr: string;
  serviceCode: string;
  version: number;
  status: "PROPOSED" | "APPROVED" | "AUTO" | "ARCHIVED";
  learnedFrom: number;
  timesUsed: number;
  timesSucceeded: number;
  confidence: number;
  autonomyEligible: boolean;
  data: {
    steps?: { order: number; titleAr: string; stability: number }[];
    documents?: { docType: string; rejectionRate: number; seen: number }[];
    avgDurationDays?: number | null;
    notesAr?: string;
  };
}
interface RenewalItem {
  operationId: string;
  userId: string;
  customerEmail: string;
  serviceNameAr: string;
  feeSar: string;
  daysUntilDue: number;
  overdue: boolean;
}

export default function OpsRoom() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "ar";
  const isEn = lang === "en";
  const L = (ar: string, en: string) => (isEn ? en : ar);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("queue");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const queue = useQuery({
    queryKey: ["ops-queue"],
    queryFn: async () =>
      (await api.get("/ops/queue")).data as { total: number; needsYouNow: number; items: QueueItem[] },
    enabled: tab === "queue",
  });
  const approvals = useQuery({
    queryKey: ["ops-approvals"],
    queryFn: async () => (await api.get("/ops/approvals")).data as { pending: number; items: ApprovalItem[] },
    enabled: tab === "approvals",
  });
  const playbooks = useQuery({
    queryKey: ["ops-playbooks"],
    queryFn: async () =>
      (await api.get("/ops/playbooks")).data as {
        total: number;
        counts: { proposed: number; approved: number; auto: number; archived: number };
        items: PlaybookItem[];
      },
    enabled: tab === "playbooks",
  });
  const renewals = useQuery({
    queryKey: ["ops-renewals"],
    queryFn: async () =>
      (await api.get("/ops/renewals")).data as {
        horizonDays: number;
        total: number;
        pipelineSar: number;
        items: RenewalItem[];
      },
    enabled: tab === "renewals",
  });

  /** Every mutating button funnels through here so errors surface consistently. */
  async function act(fn: () => Promise<string>, invalidate: string[]) {
    setBusy(true);
    setError("");
    setFlash("");
    try {
      const message = await fn();
      setFlash(message);
      for (const key of invalidate) await queryClient.invalidateQueries({ queryKey: [key] });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const statusBadge = (status: PlaybookItem["status"]) => {
    const map: Record<PlaybookItem["status"], { ar: string; en: string; cls: string }> = {
      PROPOSED: { ar: "مقترحة — تنتظر إذنك", en: "Proposed — awaiting you", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
      APPROVED: { ar: "معتمدة", en: "Approved", cls: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
      AUTO: { ar: "مستقلة — تعمل تلقائياً", en: "Autonomous", cls: "bg-brand/15 text-brand" },
      ARCHIVED: { ar: "مؤرشفة", en: "Archived", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
    };
    const s = map[status];
    return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${s.cls}`}>{isEn ? s.en : s.ar}</span>;
  };

  const tabs: [Tab, string, number | undefined][] = [
    ["queue", L("الطابور", "Queue"), queue.data?.needsYouNow],
    ["approvals", L("الموافقات", "Approvals"), approvals.data?.pending],
    ["playbooks", L("قاعدة المعرفة", "Knowledge"), playbooks.data?.counts.proposed],
    ["renewals", L("التجديدات", "Renewals"), renewals.data?.total],
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold">{L("غرفة العمليات", "Ops Room")}</h1>
        <Link to="/admin" className="text-xs font-semibold text-brand hover:underline shrink-0">
          {L("لوحة الإدارة القديمة ←", "Classic admin ←")}
        </Link>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        {L(
          "مركز تشغيل المكتب: ما ينتظر فعلك، وما يستأذنك فيه ميسوور، وما تعلّمه من معاملاتكم.",
          "Your office cockpit: what needs you, what Mysorat is asking permission for, and what it learned."
        )}
      </p>

      <div className="flex gap-1 mb-6 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {tabs.map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`whitespace-nowrap px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition-colors ${
              tab === key
                ? "border-brand text-brand"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {label}
            {count ? (
              <span className="ms-2 rounded-full bg-brand text-white px-2 py-0.5 text-[10px] font-bold">{count}</span>
            ) : null}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{error}</p>}
      {flash && <p className="mb-4 rounded-lg bg-green-50 dark:bg-green-950 p-3 text-sm text-green-700 dark:text-green-300">{flash}</p>}

      {/* ---------------------------------------------------------------- Queue */}
      {tab === "queue" && (
        <div className="flex flex-col gap-3">
          {queue.isLoading && <p className="text-center py-10 text-slate-500">{L("جارٍ التحميل...", "Loading...")}</p>}
          {queue.data && (
            <p className="text-sm text-slate-500">
              {L(
                `${queue.data.total} معاملة جارية · ${queue.data.needsYouNow} تحتاج تدخلك الآن`,
                `${queue.data.total} active · ${queue.data.needsYouNow} need you now`
              )}
            </p>
          )}
          {queue.data?.items.length === 0 && (
            <div className="card p-8 text-center text-slate-500">
              {L("لا يوجد عمل معلّق — طابورك نظيف 🎉", "Nothing pending — your queue is clear 🎉")}
            </div>
          )}
          {queue.data?.items.map((item) => (
            <div
              key={item.id}
              className={`card p-4 ${item.score >= 90 ? "border-red-300 dark:border-red-800" : item.score >= 60 ? "border-amber-300 dark:border-amber-800" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold truncate">{item.serviceNameAr}</p>
                  <p className="text-xs text-slate-500 truncate" dir="ltr">{item.customerEmail}</p>
                </div>
                <span
                  className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${
                    item.score >= 90
                      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                      : item.score >= 60
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  {item.score >= 90 ? L("عاجل", "Urgent") : item.score >= 60 ? L("مهم", "Important") : L("عادي", "Normal")}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.reasons.slice(0, 3).map((r) => (
                  <span key={r.code} className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300">
                    {r.labelAr}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>
                  {L(`الخطوة ${item.currentStep}/${item.totalSteps}`, `Step ${item.currentStep}/${item.totalSteps}`)} ·{" "}
                  {L(`عمرها ${item.ageDays} يوم`, `${item.ageDays}d old`)}
                </span>
                <Link to={`/operations/${item.id}`} className="font-semibold text-brand hover:underline">
                  {L("افتح وتصرّف ←", "Open ←")}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------ Approvals */}
      {tab === "approvals" && (
        <div className="flex flex-col gap-3">
          <div className="card p-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {L(
              "هنا يستأذنك ميسوور قبل أن يتولّى المزيد، ويبلّغك بما نفّذه تلقائياً. لا ترتفع صلاحيته خطوة واحدة دون قرارك.",
              "This is where Mysorat asks before taking on more, and reports what it already did. It never widens its own authority."
            )}
          </div>
          {approvals.isLoading && <p className="text-center py-10 text-slate-500">{L("جارٍ التحميل...", "Loading...")}</p>}
          {approvals.data?.items.length === 0 && (
            <div className="card p-8 text-center text-slate-500">{L("لا توجد طلبات", "Nothing here")}</div>
          )}
          {approvals.data?.items.map((a) => {
            const isNotice = a.kind === "AUTO_ACTION_NOTICE";
            return (
              <div key={a.id} className={`card p-4 ${a.status === "PENDING" ? "border-brand/40" : "opacity-70"}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-bold">{a.titleAr}</p>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {new Date(a.createdAt).toLocaleDateString(isEn ? "en-US" : "ar-SA")}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{a.summaryAr}</p>
                {a.status === "PENDING" ? (
                  <div className="mt-3 flex gap-2">
                    {isNotice ? (
                      <button
                        className="btn-secondary !px-4 !py-2 text-sm"
                        disabled={busy}
                        onClick={() =>
                          act(async () => {
                            await api.post(`/ops/approvals/${a.id}/decision`, { decision: "ACKNOWLEDGE" });
                            return L("تم الاطلاع", "Acknowledged");
                          }, ["ops-approvals"])
                        }
                      >
                        {L("اطّلعت", "Got it")}
                      </button>
                    ) : (
                      <>
                        <button
                          className="btn-primary !px-4 !py-2 text-sm"
                          disabled={busy}
                          onClick={() =>
                            act(async () => {
                              await api.post(`/ops/approvals/${a.id}/decision`, { decision: "APPROVE" });
                              return L("تم منح الإذن ✅", "Permission granted ✅");
                            }, ["ops-approvals", "ops-playbooks"])
                          }
                        >
                          {L("أوافق", "Approve")}
                        </button>
                        <button
                          className="btn-secondary !px-4 !py-2 text-sm"
                          disabled={busy}
                          onClick={() =>
                            act(async () => {
                              await api.post(`/ops/approvals/${a.id}/decision`, { decision: "REJECT" });
                              return L("تم الرفض", "Rejected");
                            }, ["ops-approvals", "ops-playbooks"])
                          }
                        >
                          {L("أرفض", "Reject")}
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs font-semibold text-slate-400">
                    {a.status === "APPROVED"
                      ? L("تمت الموافقة", "Approved")
                      : a.status === "REJECTED"
                      ? L("مرفوض", "Rejected")
                      : L("تم الاطلاع", "Acknowledged")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------ Playbooks */}
      {tab === "playbooks" && (
        <div className="flex flex-col gap-3">
          <div className="card p-4">
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
              {L(
                "كل معاملة تنجزونها تُغني ذاكرة ميسوور: ترتيب الخطوات، أي مستند يتعثّر، والمدة الحقيقية. اضغط «تعلَّم من معاملاتنا» ليعيد التحليل ويقترح ما استجدّ.",
                "Every operation you finish feeds Mysorat's memory: step order, which document trips people up, real durations."
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-primary !px-4 !py-2 text-sm"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    const res = await api.post("/ops/playbooks/learn");
                    const s = res.data.summary;
                    return L(
                      `تم التحليل: ${s.proposalsCreated} خطة جديدة · ${s.updatesProposed} تحديث مقترح · ${s.autonomyRequested} طلب استقلالية · ${s.playbooksRefreshed} خطة محدّثة`,
                      `Done: ${s.proposalsCreated} new · ${s.updatesProposed} updates · ${s.autonomyRequested} autonomy requests`
                    );
                  }, ["ops-playbooks", "ops-approvals"])
                }
              >
                {L("تعلَّم من معاملاتنا", "Learn from our work")}
              </button>
              <button
                className="btn-secondary !px-4 !py-2 text-sm"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    const res = await api.post("/ops/auto-run");
                    return L(
                      `الخدمات المستقلة: ${res.data.autoServices} · إجراءات نُفّذت تلقائياً: ${res.data.actionsTaken}`,
                      `Autonomous services: ${res.data.autoServices} · actions taken: ${res.data.actionsTaken}`
                    );
                  }, ["ops-approvals", "ops-queue"])
                }
              >
                {L("تشغيل المهام المستقلة", "Run autonomous tasks")}
              </button>
            </div>
            {playbooks.data && (
              <p className="mt-3 text-xs text-slate-500">
                {L(
                  `مقترحة ${playbooks.data.counts.proposed} · معتمدة ${playbooks.data.counts.approved} · مستقلة ${playbooks.data.counts.auto} · مؤرشفة ${playbooks.data.counts.archived}`,
                  `Proposed ${playbooks.data.counts.proposed} · Approved ${playbooks.data.counts.approved} · Auto ${playbooks.data.counts.auto} · Archived ${playbooks.data.counts.archived}`
                )}
              </p>
            )}
          </div>

          {playbooks.isLoading && <p className="text-center py-10 text-slate-500">{L("جارٍ التحميل...", "Loading...")}</p>}
          {playbooks.data?.items.length === 0 && (
            <div className="card p-8 text-center text-slate-500 leading-relaxed">
              {L(
                "لا توجد خطط بعد. يحتاج ميسوور 3 معاملات مكتملة على الأقل لكل خدمة قبل أن يقترح خطة — أنجزوا معاملات ثم اضغط «تعلَّم من معاملاتنا».",
                "No playbooks yet. Mysorat needs at least 3 completed operations per service before proposing one."
              )}
            </div>
          )}
          {playbooks.data?.items.map((p) => (
            <div key={p.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold truncate">
                    {p.serviceNameAr} <span className="text-xs text-slate-400">v{p.version}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {L(
                      `تعلّم من ${p.learnedFrom} معاملة · نجح ${p.timesSucceeded} من ${p.timesUsed}`,
                      `Learned from ${p.learnedFrom} · ${p.timesSucceeded}/${p.timesUsed} succeeded`
                    )}
                  </p>
                </div>
                {statusBadge(p.status)}
              </div>

              <div className="mt-3">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>{L("ثقة ميسوور", "Confidence")}</span>
                  <span>{Math.round(p.confidence * 100)}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all ${p.confidence >= 0.8 ? "bg-green-500" : p.confidence >= 0.5 ? "bg-amber-500" : "bg-slate-400"}`}
                    style={{ width: `${Math.round(p.confidence * 100)}%` }}
                  />
                </div>
              </div>

              {p.data?.notesAr && <p className="mt-3 text-xs text-slate-500 leading-relaxed">{p.data.notesAr}</p>}

              <button
                className="mt-3 text-xs font-semibold text-brand hover:underline"
                onClick={() => setExpanded(expanded === p.id ? null : p.id)}
              >
                {expanded === p.id ? L("إخفاء التفاصيل", "Hide details") : L("عرض ما تعلّمه", "Show what it learned")}
              </button>

              {expanded === p.id && (
                <div className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800 p-3 text-xs flex flex-col gap-3">
                  <div>
                    <p className="font-bold mb-1">{L("الخطوات المستخلصة", "Learned steps")}</p>
                    <ol className="flex flex-col gap-1">
                      {(p.data?.steps ?? []).map((s) => (
                        <li key={s.order} className="flex justify-between gap-2">
                          <span>
                            {s.order}. {s.titleAr}
                          </span>
                          <span className="shrink-0 text-slate-400">
                            {L(`ثبات ${Math.round(s.stability * 100)}%`, `${Math.round(s.stability * 100)}% stable`)}
                          </span>
                        </li>
                      ))}
                      {(p.data?.steps ?? []).length === 0 && <li className="text-slate-400">—</li>}
                    </ol>
                  </div>
                  <div>
                    <p className="font-bold mb-1">{L("المستندات ونسب تعثّرها", "Documents & failure rates")}</p>
                    <ul className="flex flex-col gap-1">
                      {(p.data?.documents ?? []).map((d) => (
                        <li key={d.docType} className="flex justify-between gap-2">
                          <span>{d.docType}</span>
                          <span className={`shrink-0 ${d.rejectionRate > 0.2 ? "text-red-500 font-bold" : "text-slate-400"}`}>
                            {L(`رفض ${Math.round(d.rejectionRate * 100)}%`, `${Math.round(d.rejectionRate * 100)}% rejected`)}
                          </span>
                        </li>
                      ))}
                      {(p.data?.documents ?? []).length === 0 && <li className="text-slate-400">—</li>}
                    </ul>
                  </div>
                  {p.data?.avgDurationDays != null && (
                    <p className="text-slate-500">
                      {L(`متوسط المدة الفعلية: ${p.data.avgDurationDays} يوم`, `Real average duration: ${p.data.avgDurationDays} days`)}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {p.status === "PROPOSED" && (
                  <button
                    className="btn-primary !px-4 !py-2 text-sm"
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        await api.post(`/ops/playbooks/${p.id}/decision`, { decision: "APPROVE" });
                        return L("تم اعتماد الخطة ✅", "Playbook approved ✅");
                      }, ["ops-playbooks", "ops-approvals"])
                    }
                  >
                    {L("اعتمد الخطة", "Approve")}
                  </button>
                )}
                {p.status === "APPROVED" && (
                  <button
                    className="btn-primary !px-4 !py-2 text-sm"
                    disabled={busy || !p.autonomyEligible}
                    title={
                      p.autonomyEligible
                        ? undefined
                        : L("تحتاج 5 معاملات وثقة 80% على الأقل", "Needs 5 operations and 80% confidence")
                    }
                    onClick={() =>
                      act(async () => {
                        await api.post(`/ops/playbooks/${p.id}/decision`, { decision: "GRANT_AUTONOMY" });
                        return L("مُنحت الاستقلالية — سيعمل ميسوور تلقائياً ويُشعرك", "Autonomy granted");
                      }, ["ops-playbooks", "ops-approvals"])
                    }
                  >
                    {L("امنح الاستقلالية", "Grant autonomy")}
                  </button>
                )}
                {p.status === "AUTO" && (
                  <button
                    className="btn-secondary !px-4 !py-2 text-sm"
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        await api.post(`/ops/playbooks/${p.id}/decision`, { decision: "REVOKE_AUTONOMY" });
                        return L("تم سحب الاستقلالية", "Autonomy revoked");
                      }, ["ops-playbooks"])
                    }
                  >
                    {L("اسحب الاستقلالية", "Revoke autonomy")}
                  </button>
                )}
                {p.status !== "ARCHIVED" && (
                  <button
                    className="btn-secondary !px-4 !py-2 text-sm"
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        await api.post(`/ops/playbooks/${p.id}/decision`, { decision: "ARCHIVE" });
                        return L("تم الأرشفة", "Archived");
                      }, ["ops-playbooks", "ops-approvals"])
                    }
                  >
                    {L("أرشف", "Archive")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------- Renewals */}
      {tab === "renewals" && (
        <div className="flex flex-col gap-3">
          <div className="card p-4">
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {L(
                "عملاء أنجزنا لهم خدمة قابلة للتجديد ويقترب موعدهم. هذه أرقام تقديرية مبنية على المدة المعتادة لصلاحية كل خدمة — ليست بيانات حكومية مباشرة، بل فرصة تواصل قبل أن ينساك العميل.",
                "Customers whose renewable service is coming due. These are estimates based on typical validity, not a live government feed."
              )}
            </p>
            {renewals.data && (
              <p className="mt-3 text-sm font-bold text-brand">
                {L(
                  `${renewals.data.total} فرصة خلال ${renewals.data.horizonDays} يوماً · دخل محتمل ${renewals.data.pipelineSar} ر.س`,
                  `${renewals.data.total} opportunities in ${renewals.data.horizonDays} days · ${renewals.data.pipelineSar} SAR pipeline`
                )}
              </p>
            )}
          </div>
          {renewals.isLoading && <p className="text-center py-10 text-slate-500">{L("جارٍ التحميل...", "Loading...")}</p>}
          {renewals.data?.items.length === 0 && (
            <div className="card p-8 text-center text-slate-500">
              {L("لا تجديدات قريبة حالياً", "No upcoming renewals")}
            </div>
          )}
          {renewals.data?.items.map((r) => (
            <div key={r.operationId} className={`card p-4 ${r.overdue ? "border-red-300 dark:border-red-800" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold truncate">{r.serviceNameAr}</p>
                  <p className="text-xs text-slate-500 truncate" dir="ltr">{r.customerEmail}</p>
                </div>
                <span
                  className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${
                    r.overdue
                      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  }`}
                >
                  {r.overdue
                    ? L(`متأخر ${Math.abs(r.daysUntilDue)} يوم`, `${Math.abs(r.daysUntilDue)}d overdue`)
                    : L(`بعد ${r.daysUntilDue} يوم`, `in ${r.daysUntilDue}d`)}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-500">{L(`الرسوم ${r.feeSar} ر.س`, `${r.feeSar} SAR`)}</span>
                <button
                  className="btn-secondary !px-4 !py-2 text-sm"
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      await api.post("/ops/renewals/outreach", {
                        userId: r.userId,
                        serviceNameAr: r.serviceNameAr,
                      });
                      return L("تم إرسال تنبيه التجديد للعميل", "Renewal nudge sent");
                    }, ["ops-renewals"])
                  }
                >
                  {L("أرسل تنبيه تجديد", "Send nudge")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
