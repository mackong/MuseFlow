import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above other top-level code, so the prismock
// instance has to come from vi.hoisted() to be initialized before the mock
// factory runs.
const { prismock } = vi.hoisted(() => {
  const { PrismockClient } = require("prismock");
  return { prismock: new PrismockClient() };
});
vi.mock("@/server/db/prisma", () => ({ prisma: prismock }));

import {
  _resetModeratorForTesting,
  runModerationCheck,
} from "@/server/services/moderation/moderation.service";

describe("moderation service", () => {
  beforeEach(async () => {
    process.env.MUSEFLOW_MODERATOR = "fake";
    _resetModeratorForTesting();
    // prismock has no built-in truncate; clear what we touch.
    await prismock.safetyCheck.deleteMany({});
  });

  afterEach(() => {
    _resetModeratorForTesting();
  });

  it("ALLOW path: persists a SafetyCheck row with empty categories and null reason", async () => {
    const { result, safetyCheckId } = await runModerationCheck({
      text: "Just a friendly post",
      surface: "AI_OUTPUT",
    });
    expect(result.verdict).toBe("ALLOW");
    expect(result.categories).toEqual([]);
    expect(result.reason).toBeNull();

    const persisted = await prismock.safetyCheck.findUnique({ where: { id: safetyCheckId } });
    expect(persisted).not.toBeNull();
    expect(persisted!.verdict).toBe("ALLOW");
    expect(persisted!.surface).toBe("AI_OUTPUT");
    expect(persisted!.categories).toEqual([]);
    expect(persisted!.reason).toBeNull();
    expect(persisted!.provider).toBe("fake");
  });

  it("REJECT path: persists categories + reason; surface comes from the request", async () => {
    const { result, safetyCheckId } = await runModerationCheck({
      text: "TRIGGER_REJECT please",
      surface: "POST_PUBLISH",
    });
    expect(result.verdict).toBe("REJECT");
    expect(result.categories).toEqual(["hate"]);
    expect(result.reason).toBe("contains banned phrase");

    const persisted = await prismock.safetyCheck.findUnique({ where: { id: safetyCheckId } });
    expect(persisted!.verdict).toBe("REJECT");
    expect(persisted!.surface).toBe("POST_PUBLISH");
    expect(persisted!.categories).toEqual(["hate"]);
    expect(persisted!.reason).toBe("contains banned phrase");
  });

  it("respects the COMMENT_CREATE surface", async () => {
    const { safetyCheckId } = await runModerationCheck({
      text: "ok",
      surface: "COMMENT_CREATE",
    });
    const persisted = await prismock.safetyCheck.findUnique({ where: { id: safetyCheckId } });
    expect(persisted!.surface).toBe("COMMENT_CREATE");
  });
});
