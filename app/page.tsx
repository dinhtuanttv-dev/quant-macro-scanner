"use client";

import { useState, useEffect } from "react";
import { triggerMacroFetch, getMacroNewsAction } from "@/lib/macro/actions";

function formatDate(value: unknown): string {
  if (!value) return "N/A";
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleString();
}

export default function HomePage() {
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const data = await getMacroNewsAction();
      setNews(data ?? []);
      setError(null);
    } catch (err) {
      console.error("loadData failed:", err);
      setError("Khong tai duoc tin tuc tu database.");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const summary = await triggerMacroFetch();
      console.log("Fetch summary:", summary);
      await loadData();
    } catch (err) {
      console.error("handleFetch failed:", err);
      setError("Fetch tin tuc bi loi. Xem console de biet chi tiet.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: "40px", fontFamily: "sans-serif" }}>
      <h1>Macro News Scanner</h1>

      <button onClick={handleFetch} disabled={loading} style={{ padding: "8px 16px", marginBottom: "20px" }}>
        {loading ? "Dang quet..." : "Quet tin tuc moi"}
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <h2>Danh sach tin tuc ({news.length})</h2>

      {news.length === 0 ? (
        <p>Chua co tin tuc nao. Bam nut o tren de quet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {news.map((item) => (
            <li
              key={item.id}
              style={{
                border: "1px solid #444",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "10px",
              }}
            >
              <div style={{ fontWeight: "bold" }}>{item.headline}</div>
              <div style={{ fontSize: "13px", opacity: 0.8 }}>
                {item.sourceName} | {item.scope} | {item.severity} | Impact: {item.rawImpact}
              </div>
              <div style={{ fontSize: "12px", opacity: 0.6 }}>
                {formatDate(item.publishedAt)}
              </div>
              {item.url && (
                <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px" }}>
                  Xem nguon
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}