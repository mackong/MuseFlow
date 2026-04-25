import type { ErrorCode, ErrorEnvelope } from "@/lib/contracts/shared";

/**
 * Typed errors for service-layer logic.
 *
 * Services throw these; route handlers catch them and call `toHttpResponse`
 * which maps to a status + ErrorEnvelope body per contracts/README.md.
 *
 * This is the single mapping point — adding a new error code means: add a
 * subclass + a case in `toHttpResponse` + the code in `lib/contracts/shared.ts`.
 * Nothing else changes.
 */

export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly status: number;
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
  }
}

export class UnauthenticatedError extends AppError {
  readonly code = "unauthenticated" as const;
  readonly status = 401;
}

export class ForbiddenError extends AppError {
  readonly code = "forbidden" as const;
  readonly status = 403;
}

export class NotFoundError extends AppError {
  readonly code = "not_found" as const;
  readonly status = 404;
}

export class ValidationError extends AppError {
  readonly code = "validation_failed" as const;
  readonly status = 400;
}

export class ConflictError extends AppError {
  readonly code = "conflict" as const;
  readonly status = 409;
}

export interface SafetyRejectionDetails {
  categories: string[];
  reason: string;
  surface: "AI_OUTPUT" | "POST_PUBLISH" | "COMMENT_CREATE";
}

export class SafetyRejectedError extends AppError {
  readonly code = "safety_rejected" as const;
  readonly status = 422;
  override readonly details: SafetyRejectionDetails;

  constructor(message: string, details: SafetyRejectionDetails) {
    super(message, details);
    this.details = details;
  }
}

export interface RateLimitDetails {
  retryAfterSeconds: number;
  limit: number;
  remaining: number;
  resetAt: string; // ISO 8601
}

export class RateLimitedError extends AppError {
  readonly code = "rate_limited" as const;
  readonly status = 429;
  override readonly details: RateLimitDetails;

  constructor(message: string, details: RateLimitDetails) {
    super(message, details);
    this.details = details;
  }
}

export class AIProviderError extends AppError {
  readonly code = "ai_provider_error" as const;
  readonly status = 502;
}

export class InternalError extends AppError {
  readonly code = "internal_error" as const;
  readonly status = 500;
}

// -----------------------------------------------------------------------------
// HTTP mapper
// -----------------------------------------------------------------------------

export interface HttpResponseShape {
  status: number;
  body: ErrorEnvelope;
  headers?: Record<string, string>;
}

export function toHttpResponse(error: unknown): HttpResponseShape {
  if (error instanceof AppError) {
    const headers: Record<string, string> = {};
    // RFC-compliant Retry-After for rate-limit responses.
    if (error instanceof RateLimitedError) {
      headers["Retry-After"] = String(error.details.retryAfterSeconds);
    }
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      },
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    };
  }

  // Unknown error — never leak internals to the client.
  return {
    status: 500,
    body: {
      error: {
        code: "internal_error",
        message: "An unexpected error occurred.",
      },
    },
  };
}
