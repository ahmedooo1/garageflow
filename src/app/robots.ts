import type { MetadataRoute } from "next";
import { getAppUrl } from "@/server/lib/request";

// Lu à l'exécution : APP_URL n'est pas défini pendant la construction de l'image.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = getAppUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app/", "/admin/", "/api/", "/validation/", "/desinscription/", "/reset-password/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
