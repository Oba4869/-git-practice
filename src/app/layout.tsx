import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "チーム開発の練習試合（仮）",
  description: "1人でも、AIの上司とチーム開発の練習試合ができる。本番で事故る前に、AIと事故っておこう。",
  appleWebApp: { capable: true, title: "練習試合", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f8b8d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
