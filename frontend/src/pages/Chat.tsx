import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, apiErrorMessage } from "../lib/api";
import { useSpeechToText } from "../hooks/useSpeechToText";
import { ChatResponse, Service } from "../types";

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatSession {
  sessionId: string;
  title: string;
  lastActivityAt: string;
}

function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [, base64] = result.split(",");
      resolve({ base64, mediaType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Chat() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "ar";

  function serviceName(s: Service): string {
    return lang === "en" && s.nameEn ? s.nameEn : s.nameAr;
  }

  function dayGroupLabel(iso: string): string {
    const date = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    if (sameDay(date, today)) return t("chat.today");
    if (sameDay(date, yesterday)) return t("chat.yesterday");
    return t("chat.older");
  }

  const QUICK_PROMPTS = t("chat.quickPrompts", { returnObjects: true }) as string[];
  const WELCOME: DisplayMessage = { role: "assistant", content: t("chat.welcomeMessage") };

  const [messages, setMessages] = useState<DisplayMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isRecording, unsupportedError, toggle: toggleRecording } = useSpeechToText((transcript) =>
    setInput((prev) => (prev ? `${prev} ${transcript}` : transcript))
  );
  const navigateTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => clearTimeout(navigateTimeoutRef.current);
  }, []);

  const { data: sessionsData } = useQuery({
    queryKey: ["chat-sessions"],
    queryFn: async () => (await api.get("/chat/sessions")).data as { sessions: ChatSession[] },
  });

  const { data: servicesData } = useQuery({
    queryKey: ["services"],
    queryFn: async () => (await api.get("/services")).data as { services: Service[] },
  });
  const topServices = useMemo(() => (servicesData?.services ?? []).slice(0, 4), [servicesData]);

  const groupedSessions = useMemo(() => {
    const groups = new Map<string, ChatSession[]>();
    for (const s of sessionsData?.sessions ?? []) {
      const label = dayGroupLabel(s.lastActivityAt);
      const list = groups.get(label) ?? [];
      list.push(s);
      groups.set(label, list);
    }
    return [...groups.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsData, lang]);

  function clearImage() {
    setImageFile(null);
    setFileInputKey((k) => k + 1);
  }

  function startNewChat() {
    setSessionId(undefined);
    setMessages([WELCOME]);
    setError("");
  }

  async function loadSession(id: string) {
    setError("");
    try {
      const res = await api.get(`/chat/history/${id}`);
      const history = res.data.messages as { role: "USER" | "ASSISTANT"; content: string }[];
      setSessionId(id);
      setMessages(history.map((m) => ({ role: m.role === "USER" ? "user" : "assistant", content: m.content })));
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function sendMessage(text: string, imageBase64?: string, imageMediaType?: string) {
    if (!text.trim() && !imageBase64) return;
    setError("");
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: text || t("chat.attachedImage") }]);
    setInput("");
    clearImage();

    try {
      const res = await api.post<ChatResponse>("/chat/message", {
        sessionId,
        message: text,
        contentType: imageBase64 ? "IMAGE" : "TEXT",
        imageBase64,
        imageMediaType,
      });
      setSessionId(res.data.sessionId);
      setMessages((prev) => [...prev, { role: "assistant", content: res.data.reply }]);
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });

      if (res.data.operationId) {
        clearTimeout(navigateTimeoutRef.current);
        navigateTimeoutRef.current = setTimeout(() => navigate(`/operations/${res.data.operationId}`), 1200);
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (imageFile) {
      const { base64, mediaType } = await fileToBase64(imageFile);
      await sendMessage(input, base64, mediaType);
    } else {
      await sendMessage(input);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 flex gap-6 items-start">
      {/* Right column (RTL start): previous conversations */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col gap-4">
        <div className="card p-4 sticky top-20">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm">{t("chat.previousChats")}</h2>
            <button onClick={startNewChat} className="text-brand text-lg leading-none" aria-label={t("chat.newChat")}>+</button>
          </div>
          {groupedSessions.length === 0 && <p className="text-xs text-slate-400">{t("chat.noPreviousChats")}</p>}
          <div className="flex flex-col gap-4">
            {groupedSessions.map(([label, sessions]) => (
              <div key={label}>
                <p className="text-xs text-slate-400 mb-1.5">{label}</p>
                <div className="flex flex-col gap-1">
                  {sessions.map((s) => (
                    <button
                      key={s.sessionId}
                      onClick={() => loadSession(s.sessionId)}
                      className={`text-right rounded-lg px-2.5 py-2 text-xs truncate transition ${
                        s.sessionId === sessionId
                          ? "bg-brand/10 text-brand font-semibold"
                          : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                      title={s.title}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Center: chat panel */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <h1 className="text-xl font-bold text-center">{t("chat.assistantTitle")}</h1>

        <div className="card flex flex-col gap-3 p-5 h-[55vh] overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                  m.role === "user"
                    ? "bg-slate-100 dark:bg-slate-800"
                    : "bg-gradient-to-l from-brand-light to-brand text-white"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && <p className="text-xs text-slate-400 text-center">{t("chat.typing")}</p>}
        </div>

        {(error || unsupportedError) && (
          <p className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{error || unsupportedError}</p>
        )}
        {imageFile && (
          <p className="text-xs text-slate-500">📷 {imageFile.name} <button type="button" onClick={clearImage} className="text-red-500">{t("chat.remove")}</button></p>
        )}

        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => sendMessage(p)}
                className="rounded-full border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs hover:border-brand hover:text-brand transition"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <label className="btn-secondary !px-3 !py-3 cursor-pointer">
            📷
            <input
              key={fileInputKey}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            onClick={toggleRecording}
            className={`btn-secondary !px-3 !py-3 ${isRecording ? "ring-2 ring-red-500 text-red-500" : ""}`}
          >
            🎤
          </button>
          <input
            className="input"
            placeholder={t("chat.inputPlaceholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="btn-primary" disabled={loading}>{t("chat.send")}</button>
        </form>
      </div>

      {/* Left column (RTL end): top services + safety tips */}
      <aside className="hidden xl:flex w-64 shrink-0 flex-col gap-4">
        <div className="card p-4 sticky top-20">
          <h2 className="font-bold text-sm mb-3">{t("chat.topServices")}</h2>
          <div className="flex flex-col gap-1.5">
            {topServices.map((s) => (
              <button
                key={s.id}
                onClick={() => sendMessage(t("chat.wantHelpWith", { name: serviceName(s) }))}
                className="flex items-center justify-between rounded-lg px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                {serviceName(s)}
                <span aria-hidden="true">‹</span>
              </button>
            ))}
          </div>

          <h2 className="font-bold text-sm mt-5 mb-2">{t("chat.safetyTips")}</h2>
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3">
            <p className="text-xs text-amber-800 dark:text-amber-400 leading-relaxed">
              {t("chat.safetyTipBody")}{" "}
              <Link to="/trust" className="underline font-semibold">{t("chat.privacyPolicy")}</Link>
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
