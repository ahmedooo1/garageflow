export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = "BAD_REQUEST") {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Introuvable") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Action non autorisée") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentification requise") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ValidationError extends AppError {
  readonly fields: Record<string, string>;
  constructor(message = "Données invalides", fields: Record<string, string> = {}) {
    super(message, 422, "VALIDATION");
    this.name = "ValidationError";
    this.fields = fields;
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflit") {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

/** Abonnement absent, expiré ou suspendu : l'écriture est bloquée. */
export class SubscriptionError extends AppError {
  constructor(message = "Votre abonnement ne permet plus cette action") {
    super(message, 402, "SUBSCRIPTION_REQUIRED");
    this.name = "SubscriptionError";
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Trop de tentatives, réessayez dans quelques minutes") {
    super(message, 429, "RATE_LIMITED");
    this.name = "RateLimitError";
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
