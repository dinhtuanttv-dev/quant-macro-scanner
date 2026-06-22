"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Sparkles, RefreshCw } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface ChatPanelProps {
  contextSummary: string;
}

export default function ChatPanel({ contextSummary }: ChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Xin chao! Toi la tro ly CIO AI. Ban co the hoi toi ve du lieu dang hien thi, chien luoc dau tu, hoac tin tuc thi truong moi nhat.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, contextSummary }),
      });
      const data = await res.json();
      const replyText = data?.reply || "Xin loi, toi khong nhan duoc phan hoi hop le.";
      setMessages((prev) => [...prev, { role: "assistant", text: replyText }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Khong the ket noi toi dich vu AI luc nay. Vui long thu lai sau." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)", boxShadow: "0 8px 24px rgba(245,158,11,0.4)" }}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center hover:brightness-110 transition active:scale-95"
      >
        <MessageCircle className="w-6 h-6 text-slate-950" />
      </button>
    );
  }

  return (
    <div
      style={{
        background: "linear-gradient(165deg, #0e1626 0%, #0a1020 100%)",
        border: "1px solid rgba(245,158,11,0.25)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}
      className="fixed bottom-6 right-6 z-50 w-[360px] h-[480px] rounded-2xl flex flex-col overflow-hidden"
    >
      <div style={{ borderBottom: "1px solid rgba(148,163,184,0.1)" }} className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-black text-slate-100">Tro Ly CIO AI</span>
        </div>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-200">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              style={
                msg.role === "user"
                  ? { background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }
                  : { background: "rgba(2,6,15,0.7)", border: "1px solid rgba(148,163,184,0.1)" }
              }
              className={`max-w-[85%] px-3 py-2 rounded-xl text-[11px] leading-relaxed whitespace-pre-line ${
                msg.role === "user" ? "text-slate-950 font-semibold" : "text-slate-200"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div
              style={{ background: "rgba(2,6,15,0.7)", border: "1px solid rgba(148,163,184,0.1)" }}
              className="px-3 py-2 rounded-xl text-[11px] text-slate-400 flex items-center gap-2"
            >
              <RefreshCw className="w-3 h-3 animate-spin" /> Dang suy nghi...
            </div>
          </div>
        )}
      </div>

      <div style={{ borderTop: "1px solid rgba(148,163,184,0.1)" }} className="p-3 flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder="Hoi ve thi truong, ma CP, chien luoc..."
          style={{ background: "rgba(2,6,15,0.7)", border: "1px solid rgba(148,163,184,0.15)" }}
          className="flex-1 rounded-lg px-3 py-2 text-[11px] text-slate-200 focus:outline-none focus:border-amber-500"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
          className="p-2 rounded-lg text-slate-950 disabled:opacity-40 hover:brightness-110 transition"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}