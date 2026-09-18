import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GarageFlow",
    short_name: "GarageFlow",
    description: "Gestion d'atelier pour garages indépendants",
    start_url: "/app/atelier",
    display: "standalone",
    background_color: "#eef0f3",
    theme_color: "#161c24",
    lang: "fr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
