import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "チーム開発の練習試合（仮）",
    short_name: "練習試合",
    description: "1人でも、AIの上司とチーム開発の練習試合ができる",
    start_url: "/",
    display: "standalone",
    background_color: "#1e1e1e",
    theme_color: "#0f8b8d",
    lang: "ja",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
