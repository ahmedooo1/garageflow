import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { formatPriceHt, PLANS, TRIAL_DAYS } from "@/lib/plans";
import { prisma } from "@/server/db";
import { getGrowthSettings } from "./settings";

/**
 * Rédaction assistée des messages de prospection (facultative).
 *
 * Garde-fous :
 * - le modèle ne reçoit que des faits structurés (registre, signaux booléens,
 *   hypothèse calculée) : jamais le texte d'un site web, donc pas d'injection
 *   de consignes possible depuis une page tierce ;
 * - budget mensuel vérifié avant chaque appel, sur le coût maximal possible ;
 * - chaque appel est journalisé (jetons, coût estimé, succès) ;
 * - la sortie est validée ; en cas de doute, on revient au modèle de message
 *   déterministe. Le pied de message légal est toujours ajouté par le code.
 */

export const DEFAULT_AI_MODEL = "claude-opus-5-5";
const MAX_TOKENS = 4000;

/** Tarifs publics en dollars par million de jetons (entrée, sortie). */
const PRICING: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
  "claude-sonnet-5-5": [2, 10],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};
const FALLBACK_PRICE: [number, number] = [5, 25];

export function aiModel(): string {
  return (process.env.GROWTH_AI_MODEL ?? "").trim() || DEFAULT_AI_MODEL;
}

export function costMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const [inp, out] = PRICING[model] ?? FALLBACK_PRICE;
  return Math.ceil(inputTokens * inp + outputTokens * out);
}

export async function monthlySpendMicroUsd(now = new Date()): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const agg = await prisma.aiUsage.aggregate({ where: { createdAt: { gte: start } }, _sum: { costMicroUsd: true } });
  return agg._sum.costMicroUsd ?? 0;
}

export type AiAvailability = { available: true } | { available: false; reason: string };

/** L'appel n'est autorisé que si la clé, le réglage et le budget le permettent. */
export async function aiAvailability(estimatedInputTokens = 2000): Promise<AiAvailability> {
  if (!process.env.ANTHROPIC_API_KEY) return { available: false, reason: "ANTHROPIC_API_KEY absente" };
  const settings = await getGrowthSettings();
  if (!settings.aiEnabled) return { available: false, reason: "rédaction assistée désactivée dans la console" };
  const budget = settings.aiMonthlyBudgetUsd * 1_000_000;
  const worstCase = costMicroUsd(aiModel(), estimatedInputTokens, MAX_TOKENS);
  if ((await monthlySpendMicroUsd()) + worstCase > budget) return { available: false, reason: "budget mensuel atteint" };
  return { available: true };
}

/** Faits transmis au modèle : uniquement des valeurs contrôlées par GarageFlow. */
export type DraftFacts = {
  kind: "FIRST_CONTACT" | "DEMO_INVITE" | "FOLLOW_UP";
  garageName: string;
  city: string;
  zone: string;
  teamSize: string | null;
  independent: boolean | null;
  onlineBooking: boolean | null;
  hasWebsite: boolean;
  contactName: string;
  hypothesis: string;
  senderFirstName: string;
  previousSubject: string | null;
};

const draftSchema = z.object({ subject: z.string(), body: z.string() });

const SYSTEM = `Tu rédiges des emails de prospection B2B en français pour GarageFlow, un logiciel d'atelier en ligne pour garages automobiles indépendants, au nom de son fondateur.

Faits sur GarageFlow (les seuls que tu peux affirmer) :
- Suivi de chaque véhicule de la réception à la restitution : état et photos à l'arrivée, diagnostic du technicien, travaux proposés, réparation, contrôle final, restitution, historique.
- Le client valide les travaux depuis un lien reçu par email, sans créer de compte : il voit le diagnostic, les photos et le prix de chaque ligne, et accepte ou refuse ligne par ligne. L'accord est horodaté.
- Tableau d'atelier lisible sur tablette ; rôles gérant, réception, technicien.
- Formule ${PLANS.ATELIER.name} ${formatPriceHt(PLANS.ATELIER)} HT par mois (${PLANS.ATELIER.seats} comptes), formule ${PLANS.RESEAU.name} ${formatPriceHt(PLANS.RESEAU)} HT par mois (${PLANS.RESEAU.seats} comptes). Essai gratuit de ${TRIAL_DAYS} jours sans carte bancaire. Sans engagement.

Règles :
- Vouvoiement, ton direct et sobre d'un artisan qui écrit à un autre professionnel. 120 mots maximum pour le corps.
- Le champ "hypothesis" est une hypothèse : formule-la comme une question ou une possibilité, jamais comme un constat sur le garage.
- N'affirme rien sur le garage au-delà des faits fournis. Ne suppose rien sur son logiciel ou ses outils actuels. N'invente ni chiffre, ni client, ni témoignage, ni résultat.
- Pas d'urgence artificielle, pas de superlatif, pas d'emoji, pas de mention d'intelligence artificielle.
- N'écris aucune adresse web ni email. Si tu proposes l'essai, écris exactement {{LIEN_ESSAI}} à l'endroit du lien, une seule fois.
- Termine par le prénom de l'expéditeur seul. N'ajoute ni mentions légales ni lien de désinscription : ils sont ajoutés ensuite.
- kind FIRST_CONTACT : premier message. DEMO_INVITE : proposer une démonstration de 20 minutes à l'atelier ou en visio. FOLLOW_UP : courte relance unique et polie du message "previousSubject", qui laisse la porte ouverte.

Réponds uniquement avec l'objet et le corps du message.`;

const FORBIDDEN = [/https?:\/\//i, /www\./i, /@/, /d[ée]sinscri/i, /(votre|vos)\s+(logiciel|outil|syst[eè]me|solution)s?\s+actuel/i, /intelligence artificielle|\bIA\b/];

export function validateAiDraft(d: { subject: string; body: string }): string | null {
  const subject = d.subject.trim();
  const body = d.body.trim();
  if (subject.length < 5 || subject.length > 90) return "objet hors limites";
  if (body.length < 150 || body.length > 1400) return "corps hors limites";
  if ((body.match(/\{\{LIEN_ESSAI\}\}/g)?.length ?? 0) > 1) return "lien répété";
  for (const re of FORBIDDEN) if (re.test(subject) || re.test(body)) return `motif interdit ${re.source}`;
  return null;
}

async function logUsage(entry: { model: string; inputTokens: number; outputTokens: number; leadId?: string; ok: boolean; error?: string }) {
  await prisma.aiUsage.create({
    data: {
      purpose: "outreach_draft",
      model: entry.model,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      costMicroUsd: costMicroUsd(entry.model, entry.inputTokens, entry.outputTokens),
      leadId: entry.leadId,
      ok: entry.ok,
      error: (entry.error ?? "").slice(0, 300),
    },
  });
}

/** Renvoie un brouillon validé, ou null (l'appelant utilise alors le modèle déterministe). */
export async function generateAiDraft(facts: DraftFacts, leadId?: string): Promise<{ subject: string; body: string; model: string } | { error: string }> {
  const availability = await aiAvailability();
  if (!availability.available) return { error: availability.reason };
  const model = aiModel();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 60_000 });
  // Le repli serveur est proposé sur les modèles qui le prennent en charge (pas Haiku).
  const fallback = model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };
  try {
    const response = await client.beta.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      ...fallback,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { subject: { type: "string" }, body: { type: "string" } },
            required: ["subject", "body"],
            additionalProperties: false,
          },
        },
      },
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(facts) }],
    });
    const served = response.model || model;
    const usage = { model: served, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, leadId };
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      await logUsage({ ...usage, ok: false, error: `stop_reason ${response.stop_reason}` });
      return { error: `réponse inutilisable (${response.stop_reason})` };
    }
    const text = response.content.find((b) => b.type === "text");
    let json: unknown = null;
    try {
      json = text && text.type === "text" ? JSON.parse(text.text) : null;
    } catch {
      json = null;
    }
    const parsed = draftSchema.safeParse(json);
    const invalid = parsed.success ? validateAiDraft(parsed.data) : "format invalide";
    await logUsage({ ...usage, ok: !invalid, error: invalid ?? undefined });
    if (!parsed.success || invalid) return { error: `brouillon rejeté : ${invalid}` };
    return { subject: parsed.data.subject.trim(), body: parsed.data.body.trim(), model: served };
  } catch (e) {
    const message = e instanceof Anthropic.APIError ? `API ${e.status ?? "?"}` : e instanceof Error ? e.message : "erreur";
    await logUsage({ model, inputTokens: 0, outputTokens: 0, leadId, ok: false, error: message });
    return { error: message };
  }
}
