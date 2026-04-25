import { describe, expect, it } from "vitest";

import {
  AIProviderError,
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  RateLimitedError,
  SafetyRejectedError,
  UnauthenticatedError,
  ValidationError,
  toHttpResponse,
} from "@/server/errors";

/**
 * The mapping from typed error → { status, body, headers? } is the single
 * place where service-layer errors become HTTP responses. A regression here
 * would silently change every API route's contract — this test guards it.
 */
describe("toHttpResponse", () => {
  it("maps UnauthenticatedError → 401", () => {
    const r = toHttpResponse(new UnauthenticatedError("nope"));
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("unauthenticated");
    expect(r.body.error.message).toBe("nope");
    expect(r.headers).toBeUndefined();
  });

  it("maps ForbiddenError → 403", () => {
    expect(toHttpResponse(new ForbiddenError("x")).status).toBe(403);
  });

  it("maps NotFoundError → 404", () => {
    expect(toHttpResponse(new NotFoundError("x")).status).toBe(404);
  });

  it("maps ValidationError → 400", () => {
    const r = toHttpResponse(new ValidationError("bad", { field: "title" }));
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("validation_failed");
    expect(r.body.error.details).toEqual({ field: "title" });
  });

  it("maps ConflictError → 409", () => {
    expect(toHttpResponse(new ConflictError("dupe")).status).toBe(409);
  });

  it("maps SafetyRejectedError → 422 with categories + reason in details", () => {
    const r = toHttpResponse(
      new SafetyRejectedError("blocked", {
        categories: ["hate", "violence"],
        reason: "contains banned phrase",
        surface: "POST_PUBLISH",
      }),
    );
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("safety_rejected");
    expect(r.body.error.details).toMatchObject({
      categories: ["hate", "violence"],
      reason: "contains banned phrase",
      surface: "POST_PUBLISH",
    });
  });

  it("maps RateLimitedError → 429 with Retry-After header and details", () => {
    const r = toHttpResponse(
      new RateLimitedError("slow down", {
        retryAfterSeconds: 42,
        limit: 20,
        remaining: 0,
        resetAt: "2026-04-25T15:00:00.000Z",
      }),
    );
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe("rate_limited");
    expect(r.headers).toEqual({ "Retry-After": "42" });
  });

  it("maps AIProviderError → 502", () => {
    expect(toHttpResponse(new AIProviderError("upstream")).status).toBe(502);
  });

  it("maps InternalError → 500", () => {
    expect(toHttpResponse(new InternalError("boom")).status).toBe(500);
  });

  it("maps unknown thrown values → generic 500 without leaking the message", () => {
    const r1 = toHttpResponse(new Error("internal db secret in here"));
    expect(r1.status).toBe(500);
    expect(r1.body.error.code).toBe("internal_error");
    expect(r1.body.error.message).not.toContain("internal db secret");
    expect(r1.body.error.details).toBeUndefined();

    const r2 = toHttpResponse("not even an Error");
    expect(r2.status).toBe(500);
    expect(r2.body.error.code).toBe("internal_error");
  });
});
