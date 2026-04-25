import type {
  Moderator,
  ModerationRequest,
  ModerationResult,
  SafetyCategory,
} from "./moderator.interface";

/**
 * Deterministic moderator for tests and `MUSEFLOW_MODERATOR=fake`.
 *
 * Default policy:
 *   - text contains "TRIGGER_REJECT" → REJECT, categories=["hate"]
 *   - any other text → ALLOW
 *
 * Tests can override either branch via setRejectingFor / setAllowAll.
 */
export class FakeModerator implements Moderator {
  readonly name = "fake";

  private rejectPattern: RegExp = /TRIGGER_REJECT/;
  private rejectCategories: SafetyCategory[] = ["hate"];
  private rejectReason = "contains banned phrase";

  /** Make the moderator reject every input. */
  setRejectingAll(categories: SafetyCategory[] = ["hate"], reason = "rejected"): void {
    this.rejectPattern = /.*/;
    this.rejectCategories = [...categories].sort();
    this.rejectReason = reason;
  }

  /** Disable rejection entirely. */
  setAllowAll(): void {
    this.rejectPattern = /(?!)/; // never matches
    this.rejectCategories = [];
    this.rejectReason = "allowed";
  }

  /** Restore default trigger-phrase behavior. */
  reset(): void {
    this.rejectPattern = /TRIGGER_REJECT/;
    this.rejectCategories = ["hate"];
    this.rejectReason = "contains banned phrase";
  }

  async check(req: ModerationRequest): Promise<ModerationResult> {
    const start = Date.now();
    const reject = this.rejectPattern.test(req.text);
    return {
      verdict: reject ? "REJECT" : "ALLOW",
      categories: reject ? [...this.rejectCategories].sort() : [],
      reason: reject ? this.rejectReason : null,
      rawProvider: this.name,
      latencyMs: Date.now() - start,
    };
  }
}
