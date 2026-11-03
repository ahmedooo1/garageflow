import type { MetadataRoute } from "next";
import { getAppUrl } from "@/server/lib/request";

// Lu à l'exécution : APP_URL n'est pas défini pendant la construction de l'image.
export const dynamic = "force-dynamic";

/** Pages publiques indexables uniquement. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getAppUrl();
  return [
    { url: `${base}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/register`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${base}/cgu`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/confidentialite`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
