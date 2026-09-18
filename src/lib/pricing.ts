import Decimal from "decimal.js";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export type DecimalInput = Decimal.Value;

export function money(value: DecimalInput): Decimal {
  return new Decimal(value ?? 0);
}

/** Arrondi monétaire à 2 décimales (demi-supérieur). */
export function round2(value: DecimalInput): Decimal {
  return money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export type LineTotals = {
  totalHt: Decimal;
  vatAmount: Decimal;
  totalTtc: Decimal;
};

/** Calcule HT / TVA / TTC d'une ligne. Le taux de TVA est en pourcentage (ex : 20). */
export function computeLine(partsPrice: DecimalInput, laborPrice: DecimalInput, vatRate: DecimalInput): LineTotals {
  const parts = round2(partsPrice);
  const labor = round2(laborPrice);
  if (parts.isNegative() || labor.isNegative()) throw new Error("Les montants ne peuvent pas être négatifs");
  const rate = money(vatRate);
  if (rate.isNegative() || rate.greaterThan(100)) throw new Error("Taux de TVA invalide");
  const totalHt = parts.plus(labor);
  const vatAmount = round2(totalHt.times(rate).dividedBy(100));
  const totalTtc = totalHt.plus(vatAmount);
  return { totalHt, vatAmount, totalTtc };
}

export type LineLike = {
  totalHt: DecimalInput;
  vatAmount: DecimalInput;
  totalTtc: DecimalInput;
  decision?: "PENDING" | "ACCEPTED" | "REFUSED";
};

export type EstimateTotals = {
  totalHt: Decimal;
  vatAmount: Decimal;
  totalTtc: Decimal;
  acceptedTtc: Decimal;
  refusedTtc: Decimal;
  pendingTtc: Decimal;
  acceptedCount: number;
  refusedCount: number;
};

export function computeTotals(lines: readonly LineLike[]): EstimateTotals {
  let totalHt = money(0);
  let vatAmount = money(0);
  let totalTtc = money(0);
  let acceptedTtc = money(0);
  let refusedTtc = money(0);
  let pendingTtc = money(0);
  let acceptedCount = 0;
  let refusedCount = 0;
  for (const line of lines) {
    totalHt = totalHt.plus(line.totalHt);
    vatAmount = vatAmount.plus(line.vatAmount);
    totalTtc = totalTtc.plus(line.totalTtc);
    if (line.decision === "ACCEPTED") {
      acceptedTtc = acceptedTtc.plus(line.totalTtc);
      acceptedCount += 1;
    } else if (line.decision === "REFUSED") {
      refusedTtc = refusedTtc.plus(line.totalTtc);
      refusedCount += 1;
    } else {
      pendingTtc = pendingTtc.plus(line.totalTtc);
    }
  }
  return {
    totalHt: round2(totalHt),
    vatAmount: round2(vatAmount),
    totalTtc: round2(totalTtc),
    acceptedTtc: round2(acceptedTtc),
    refusedTtc: round2(refusedTtc),
    pendingTtc: round2(pendingTtc),
    acceptedCount,
    refusedCount,
  };
}

const eurFormatter = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export function formatEur(value: DecimalInput): string {
  return eurFormatter.format(round2(value).toNumber());
}

/** Parse une saisie utilisateur ("175", "175,50", "1 200.00") en Decimal. */
export function parseMoneyInput(raw: string): Decimal | null {
  const cleaned = raw.replace(/\s| /g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return round2(cleaned);
}
