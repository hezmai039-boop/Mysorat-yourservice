import { useRef, useState } from "react";

export function useSpeechToText(onResult: (transcript: string) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const [unsupportedError, setUnsupportedError] = useState("");
  const recognitionRef = useRef<any>(null);

  function toggle() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setUnsupportedError("متصفحك لا يدعم التحويل الصوتي، الرجاء الكتابة يدوياً");
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    setUnsupportedError("");
    const recognition = new SpeechRecognition();
    recognition.lang = "ar-SA";
    recognition.interimResults = false;
    recognition.onresult = (event: any) => onResult(event.results[0][0].transcript);
    recognition.onend = () => setIsRecording(false);
    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
  }

  return { isRecording, unsupportedError, toggle };
}
