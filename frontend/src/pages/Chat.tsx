import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiErrorMessage } from "../lib/api";
import { useSpeechToText } from "../hooks/useSpeechToText";
import { ChatResponse } from "../types";

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
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
  const [messages, setMessages] = useState<DisplayMessage[]>([
    { role: "assistant", content: "ميسوور في خدمتك، تفضل كيف أقدر أخدمك؟" },
  ]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const navigate = useNavigate();
  const { isRecording, unsupportedError, toggle: toggleRecording } = useSpeechToText((transcript) =>
    setInput((prev) => (prev ? `${prev} ${transcript}` : transcript))
  );
  const navigateTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => clearTimeout(navigateTimeoutRef.current);
  }, []);

  function clearImage() {
    setImageFile(null);
    setFileInputKey((k) => k + 1);
  }

  async function sendMessage(text: string, imageBase64?: string, imageMediaType?: string) {
    if (!text.trim() && !imageBase64) return;
    setError("");
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: text || "📷 صورة مرفقة" }]);
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
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-10">
      <h1 className="text-2xl font-bold text-center">المساعد الذكي</h1>

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
        {loading && <p className="text-xs text-slate-400 text-center">ميسوور يكتب...</p>}
      </div>

      {(error || unsupportedError) && (
        <p className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{error || unsupportedError}</p>
      )}
      {imageFile && (
        <p className="text-xs text-slate-500">📷 {imageFile.name} <button type="button" onClick={clearImage} className="text-red-500">إزالة</button></p>
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
          placeholder="اكتب طلبك هنا..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="btn-primary" disabled={loading}>إرسال</button>
      </form>
    </div>
  );
}
