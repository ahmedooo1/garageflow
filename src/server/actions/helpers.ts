import { isRedirectError } from "next/dist/client/components/redirect-error";
import { InvalidTransitionError } from "@/lib/state-machine";
import { isAppError, ValidationError } from "@/server/lib/errors";

export type ActionState<T = void> = {
  ok: boolean;
  error?: string;
  fields?: Record<string, string>;
  data?: T;
  /** Incrémenté à chaque retour pour permettre aux formulaires de se réinitialiser. */
  seq?: number;
};

/** Exécute une action serveur en convertissant les erreurs métier en état lisible. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionState<T>> {
  try {
    const data = await fn();
    return { ok: true, data, seq: Date.now() };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    if (e instanceof ValidationError) return { ok: false, error: e.message, fields: e.fields, seq: Date.now() };
    if (isAppError(e)) return { ok: false, error: e.message, seq: Date.now() };
    if (e instanceof InvalidTransitionError) return { ok: false, error: e.message, seq: Date.now() };
    console.error("[action] erreur inattendue", e);
    return { ok: false, error: "Une erreur inattendue est survenue", seq: Date.now() };
  }
}

export function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}
