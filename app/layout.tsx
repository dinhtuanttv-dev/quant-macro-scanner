
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Global Quant-Macro & Market Scanner",
  description:
    "CIO Engine — Chuyên gia phân tích liên thị trường & Momentum Trading. Tác giả: Đinh Công Tuấn.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}