import { NextResponse } from "next/server";
import { LEAD_STAGE_LABELS } from "@/lib/growth/labels";
import { zoneLabel } from "@/lib/growth/zones";
import { requirePlatformAdminAction } from "@/server/context";
import { prisma } from "@/server/db";
import { isAppError } from "@/server/lib/errors";
import { audit } from "@/server/services/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Neutralise les formules (=, +, -, @) à l'ouverture dans un tableur. */
function cell(value: unknown): string {
  let s = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Export CSV des prospects : console plateforme uniquement, chaque export est journalisé. */
export async function GET() {
  try {
    const admin = await requirePlatformAdminAction();
    const leads = await prisma.lead.findMany({ orderBy: [{ score: "desc" }], take: 5000 });
    const header = ["nom", "siret", "adresse", "code_postal", "ville", "zone", "etape", "score", "confiance", "email", "source_email", "telephone", "source_telephone", "site_web", "source", "source_url", "prochaine_relance", "dernier_contact", "opposition"];
    const lines = [header.join(";")];
    for (const l of leads) {
      lines.push(
        [
          l.name, l.siret, l.address, l.postalCode, l.city, zoneLabel(l.zone), LEAD_STAGE_LABELS[l.stage], l.score, l.confidence, l.email, l.emailSourceUrl,
          l.phone, l.phoneSourceUrl, l.website, l.source, l.sourceUrl, l.nextFollowUpAt, l.lastContactedAt, l.optedOutAt,
        ]
          .map(cell)
          .join(";"),
      );
    }
    await audit({ userId: admin.id, action: "growth.leads_exported", entityType: "Lead", metadata: { count: leads.length } });
    return new NextResponse(`﻿${lines.join("\r\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="prospects-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (isAppError(e)) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[prospects export]", e);
    return NextResponse.json({ error: "Export impossible" }, { status: 500 });
  }
}
