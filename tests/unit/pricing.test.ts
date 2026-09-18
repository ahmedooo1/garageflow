import { describe, expect, it } from "vitest";
import { computeLine, computeTotals, formatEur, parseMoneyInput, round2 } from "@/lib/pricing";

describe("calcul des prix (Decimal)", () => {
  it("calcule HT / TVA / TTC d'une ligne", () => {
    const t = computeLine("62.50", "83.33", 20);
    expect(t.totalHt.toFixed(2)).toBe("145.83");
    expect(t.vatAmount.toFixed(2)).toBe("29.17");
    expect(t.totalTtc.toFixed(2)).toBe("175.00");
  });

  it("évite les erreurs de flottants", () => {
    // 0.1 + 0.2 en float = 0.30000000000000004
    const t = computeLine("0.10", "0.20", 0);
    expect(t.totalHt.toFixed(2)).toBe("0.30");
    expect(t.totalHt.toString()).toBe("0.3");
    const t2 = computeLine("1.005", "0", 0);
    expect(t2.totalHt.toFixed(2)).toBe("1.01"); // arrondi demi-supérieur, pas 1.00
  });

  it("arrondit la TVA au centime (demi-supérieur)", () => {
    const t = computeLine("10.01", "0", 20); // 2.002 → 2.00
    expect(t.vatAmount.toFixed(2)).toBe("2.00");
    const t2 = computeLine("10.03", "0", 20); // 2.006 → 2.01
    expect(t2.vatAmount.toFixed(2)).toBe("2.01");
    expect(t2.totalTtc.toFixed(2)).toBe("12.04");
  });

  it("supporte la TVA réduite et nulle", () => {
    expect(computeLine("100", "0", 5.5).totalTtc.toFixed(2)).toBe("105.50");
    expect(computeLine("100", "0", 0).totalTtc.toFixed(2)).toBe("100.00");
  });

  it("refuse les montants négatifs et les taux invalides", () => {
    expect(() => computeLine("-1", "0", 20)).toThrow();
    expect(() => computeLine("1", "0", 101)).toThrow();
    expect(() => computeLine("1", "0", -1)).toThrow();
  });

  it("totalise en distinguant accepté / refusé / en attente", () => {
    const lines = [
      { ...computeLine("62.50", "83.33", 20), decision: "ACCEPTED" as const },
      { ...computeLine("48.00", "43.67", 20), decision: "REFUSED" as const },
      { ...computeLine("29.90", "8.00", 20), decision: "PENDING" as const },
    ];
    const t = computeTotals(lines);
    expect(t.totalTtc.toFixed(2)).toBe("330.48");
    expect(t.acceptedTtc.toFixed(2)).toBe("175.00");
    expect(t.refusedTtc.toFixed(2)).toBe("110.00");
    expect(t.pendingTtc.toFixed(2)).toBe("45.48");
    expect(t.acceptedCount).toBe(1);
    expect(t.refusedCount).toBe(1);
  });

  it("parse les saisies françaises", () => {
    expect(parseMoneyInput("175")?.toFixed(2)).toBe("175.00");
    expect(parseMoneyInput("175,50")?.toFixed(2)).toBe("175.50");
    expect(parseMoneyInput("1 200.00")?.toFixed(2)).toBe("1200.00");
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("1.234")).toBeNull();
    expect(parseMoneyInput("-5")).toBeNull();
  });

  it("formate en euros", () => {
    expect(formatEur("175").replace(/ | /g, " ")).toBe("175,00 €");
    expect(round2("1.005").toString()).toBe("1.01");
  });
});
