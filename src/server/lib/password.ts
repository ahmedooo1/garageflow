import bcrypt from "bcryptjs";

const COST = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Hash factice utilisé pour égaliser le temps de réponse quand l'email n'existe pas. */
export const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8Z7bL3f5rX3B7ZQq8e1Wq6m1nQYzO2";
