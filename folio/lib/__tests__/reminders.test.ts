import { describe, expect, it } from "vitest";
import { reminderStage, reminderSummary } from "../reminders";

describe("reminderStage", () => {
  it("uses 7 and 1 by default-style settings", () => {
    expect(reminderStage(8, 7, 1)).toBeNull();
    expect(reminderStage(7, 7, 1)).toBe("first");
    expect(reminderStage(2, 7, 1)).toBe("first");
    expect(reminderStage(1, 7, 1)).toBe("second");
    expect(reminderStage(0, 7, 1)).toBe("second");
    expect(reminderStage(-1, 7, 1)).toBeNull();
  });
  it("supports custom timings and a switched-off second reminder", () => {
    expect(reminderStage(12, 14, 2)).toBe("first");
    expect(reminderStage(2, 14, 2)).toBe("second");
    expect(reminderStage(0, 3, null)).toBe("first");
    expect(reminderStage(1, 3, 0)).toBe("first");
    expect(reminderStage(0, 3, 0)).toBe("second");
  });
});

describe("reminderSummary", () => {
  it("describes the user's choice in plain words", () => {
    expect(reminderSummary(7, 1)).toBe("You'll get an alert 7 days and 1 day before.");
    expect(reminderSummary(10, 0)).toBe("You'll get an alert 10 days before and on the day.");
    expect(reminderSummary(5, null)).toBe("You'll get an alert 5 days before.");
  });
});
