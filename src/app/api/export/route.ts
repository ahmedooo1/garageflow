import { NextResponse } from "next/server";
import { requireCtx } from "@/server/context";
import { isAppError } from "@/server/lib/errors";
import { getClientIp } from "@/server/lib/request";
import { exportGarageData } from "@/server/services/data-export";

export const runtime = "nodejs";

/** Export JSON des données du garage (portabilité RGPD, gérant uniquement). */
export async function GET() {
  try {
    // Autorisé même sans abonnement actif : le garage doit pouvoir récupérer ses données.
    const { ctx } = await requireCtx("garage:settings", { allowExpired: true });
    ctx.ip = await getClientIp();
    const data = await exportGarageData(ctx);
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="garageflow-export-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (isAppError(e)) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[export]", e);
    return NextResponse.json({ error: "Export impossible" }, { status: 500 });
  }
}
