import { useState } from "react";
import { api, apiErrorMessage } from "../lib/api";
import { useSpeechToText } from "../hooks/useSpeechToText";

export function FeedbackModal({
  operationId,
  onDone,
}: {
  operationId: string;
  onDone: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { isRecording, unsupportedError, toggle: toggleRecording } = useSpeechToText((transcript) =>
    setComment((prev) => (prev ? `${prev} ${transcript}` : transcript))
  );

  async function submit() {
    if (rating === 0) {
      setError("الرجاء اختيار تقييم قبل المتابعة");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.post("/feedback", { operationId, rating, comment: comment || undefined, transcribed: comment.length > 0 });
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="text-xl font-bold text-center mb-2">قيّم تجربتك مع ميسوور</h2>
        <p className="text-sm text-slate-500 text-center mb-4">رأيك يساعدنا نخدمك بشكل أفضل — قبل إغلاق المعاملة</p>

        <div className="flex justify-center gap-2 mb-4 text-3xl">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)} className={n <= rating ? "text-brand-accent" : "text-slate-300"}>
              ★
            </button>
          ))}
        </div>

        <div className="flex items-start gap-2 mb-4">
          <textarea
            className="input"
            rows={3}
            placeholder="اكتب تعليقك (اختياري)..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button type="button" onClick={toggleRecording} className={`btn-secondary !px-3 !py-3 ${isRecording ? "ring-2 ring-red-500 text-red-500" : ""}`}>
            🎤
          </button>
        </div>

        {(error || unsupportedError) && (
          <p className="mb-3 rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-600">{error || unsupportedError}</p>
        )}

        <button className="btn-primary w-full" onClick={submit} disabled={submitting}>
          {submitting ? "جارِ الإرسال..." : "إرسال التقييم وإنهاء المعاملة"}
        </button>
      </div>
    </div>
  );
}
