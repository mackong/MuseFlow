import type { ErrorEnvelope } from "@/lib/contracts/shared";

/**
 * Tiny browser fetch wrapper.
 *
 * - Sends JSON bodies and parses JSON responses.
 * - Throws ApiError with the typed error envelope on non-2xx responses, so
 *   callers can pattern-match on `error.code` (unauthenticated, rate_limited,
 *   safety_rejected, …) without re-parsing the body.
 * - Same-origin only — relies on the Auth.js session cookie automatically
 *   attached by the browser.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly envelope: ErrorEnvelope;

  constructor(status: number, envelope: ErrorEnvelope) {
    super(envelope.error.message);
    this.name = "ApiError";
    this.status = status;
    this.envelope = envelope;
  }

  get code(): ErrorEnvelope["error"]["code"] {
    return this.envelope.error.code;
  }
  get details(): unknown {
    return this.envelope.error.details;
  }
}

interface RequestInitJSON extends RequestInit {
  json?: unknown;
}

export async function api<T = unknown>(url: string, init: RequestInitJSON = {}): Promise<T> {
  const { json, headers, body: rawBody, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "content-type": "application/json" } : {}),
      ...(headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : (rawBody ?? null),
  });

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    if (!res.ok) {
      throw new ApiError(res.status, {
        error: { code: "internal_error", message: `HTTP ${res.status}` },
      });
    }
    return undefined as T;
  }

  const body = (await res.json()) as unknown;
  if (!res.ok) {
    throw new ApiError(res.status, body as ErrorEnvelope);
  }
  return body as T;
}
