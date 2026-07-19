import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../lib/api";

interface SupportRequestItem {
  id: string;
  message: string;
  status: "OPEN" | "ANSWERED" | "CLOSED";
  ownerReply: string | null;
  ownerReplyAt: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<SupportRequestItem["status"], string> = {
  OPEN: "بانتظار الرد",
  ANSWERED: "تم الرد",
  CLOSED: "مغلقة",
};

export default function Support() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["support-mine"],
    queryFn: async () => (await api.get("/support/mine")).data as { requests: SupportRequestItem[] },
  });

  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/support", { message });
      setMessage("");
      await queryClient.invalidateQueries({ queryKey: ["support-mine"] });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold mb-1">تواصل مع فريق الدعم</h1>
      <p className="text-sm text-slate-500 mb-6">فريقنا البشري يرد مباشرة على استفساراتك خلف الذكاء الاصطناعي.</p>

      <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-4 mb-8">
        {error && <p className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{error}</p>}
        <textarea
          className="input min-h-[100px]"
          placeholder="اكتب رسالتك لفريق الدعم..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          minLength={5}
          maxLength={2000}
          required
        />
        <button className="btn-primary" disabled={busy}>{busy ? "جارِ الإرسال..." : "إرسال"}</button>
      </form>

      <h2 className="font-bold mb-3">رسائلك السابقة</h2>
      <div className="flex flex-col gap-3">
        {data?.requests.length === 0 && <p className="text-sm text-slate-500">لا توجد رسائل سابقة.</p>}
        {data?.requests.map((r) => (
          <div key={r.id} className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <span
                className={`text-xs font-semibold ${
                  r.status === "ANSWERED" ? "text-green-600" : r.status === "CLOSED" ? "text-slate-400" : "text-amber-600"
                }`}
              >
                {STATUS_LABEL[r.status]}
              </span>
              <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString("ar-SA")}</span>
            </div>
            <p className="text-sm">{r.message}</p>
            {r.ownerReply && (
              <div className="mt-3 rounded-lg bg-brand/5 p-3 text-sm">
                <p className="text-xs font-semibold text-brand mb-1">رد فريق الدعم</p>
                <p>{r.ownerReply}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
