"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Mesure d'audience : une requête par page affichée, sans cookie ni stockage
 * local. Respecte Do Not Track et Global Privacy Control.
 */
export function Audience() {
  const pathname = usePathname();
  useEffect(() => {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl) return;
    const utmSource = new URLSearchParams(window.location.search).get("utm_source") ?? "";
    const body = JSON.stringify({ path: pathname, referrer: document.referrer, utmSource });
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/audience", blob)) {
      void fetch("/api/audience", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => undefined);
    }
  }, [pathname]);
  return null;
}
