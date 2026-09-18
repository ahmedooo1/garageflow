import { z } from "zod";
import { ValidationError } from "./errors";

/** Valide `input` avec `schema`, lève ValidationError (messages par champ) sinon. */
export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  const first = Object.values(fields)[0] ?? "Données invalides";
  throw new ValidationError(first, fields);
}

/** Convertit un FormData en objet plat (les champs répétés deviennent des tableaux). */
export function formToObject(form: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value !== "string") continue;
    if (key.startsWith("$")) continue; // champs internes Next
    if (key in obj) {
      const existing = obj[key];
      obj[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      obj[key] = value;
    }
  }
  return obj;
}

export const requiredText = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} obligatoire`).max(max, `Maximum ${max} caractères`);
export const optionalText = (max = 2000) => z.string().trim().max(max).default("");

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Email invalide")
  .max(200);

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .refine((v) => v === "" || z.string().email().safeParse(v).success, "Email invalide")
  .default("");

export const intField = (label: string, min = 0, max = 10_000_000) =>
  z.coerce
    .number({ message: `${label} invalide` })
    .int(`${label} doit être un entier`)
    .min(min, `${label} invalide`)
    .max(max, `${label} invalide`);

export const optionalInt = (min = 0, max = 10_000_000) =>
  z
    .union([z.literal(""), z.coerce.number().int().min(min).max(max)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v));

export const optionalDateTime = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((v) => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  });

export const idField = z.string().trim().min(1).max(64);
export const optionalId = z
  .string()
  .trim()
  .max(64)
  .nullish()
  .transform((v) => (v ? v : null));

export const passwordField = z
  .string()
  .min(10, "Le mot de passe doit contenir au moins 10 caractères")
  .max(200, "Mot de passe trop long");

export const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true" || v === "1");
