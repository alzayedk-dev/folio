/** Earnings reminder timing. Defaults: 7 days and 1 day before. Second can be off (null) or 0 (on the day). */
export const DEFAULT_REMINDERS = { first: 7, second: 1 as number | null };

export type ReminderStage = "second" | "first" | null;

/** Which reminder (if any) applies when a company reports in `left` days. Mirrors supabase/functions/daily. */
export function reminderStage(left: number, first: number, second: number | null): ReminderStage {
  if (left < 0) return null;
  if (second != null && left <= second) return "second";
  if (left <= first) return "first";
  return null;
}

const dayText = (n: number) => (n === 0 ? "on the day" : n === 1 ? "1 day before" : `${n} days before`);

/** e.g. "You'll get an alert 7 days and 1 day before." */
export function reminderSummary(first: number, second: number | null): string {
  if (second == null) return `You'll get an alert ${dayText(first)}.`;
  if (second === 0) return `You'll get an alert ${dayText(first)} and on the day.`;
  return `You'll get an alert ${first} days and ${dayText(second)}.`;
}
