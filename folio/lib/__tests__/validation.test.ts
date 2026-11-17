import { describe, expect, it } from "vitest";
import { safeNext, signUpSchema } from "../validation";
import { messages, authErrorMessage } from "../messages";

const valid = {
  displayName: "TechBull88",
  fullName: "Test Person",
  email: "test@example.com",
  password: "longenough",
  confirmPassword: "longenough",
  startingCash: "5000",
  startingCurrency: "EUR",
};

describe("signUpSchema", () => {
  it("accepts a valid sign-up and converts cash to a number", () => {
    const r = signUpSchema.parse(valid);
    expect(r.startingCash).toBe(5000);
  });
  it("rejects short passwords with a friendly message", () => {
    const r = signUpSchema.safeParse({ ...valid, password: "short", confirmPassword: "short" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe(messages.auth.weakPassword);
  });
  it("rejects mismatched passwords", () => {
    const r = signUpSchema.safeParse({ ...valid, confirmPassword: "different1" });
    expect(r.error?.issues[0].message).toBe(messages.auth.passwordMismatch);
  });
  it("rejects negative cash and unknown currencies", () => {
    expect(signUpSchema.safeParse({ ...valid, startingCash: "-5" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, startingCurrency: "XXX" }).success).toBe(false);
  });
  it("rejects a one-letter display name", () => {
    expect(signUpSchema.safeParse({ ...valid, displayName: "A" }).success).toBe(false);
  });
});

describe("safeNext", () => {
  it("keeps internal paths", () => expect(safeNext("/performance")).toBe("/performance"));
  it("blocks external redirects", () => {
    expect(safeNext("https://evil.example")).toBe("/portfolio");
    expect(safeNext("//evil.example")).toBe("/portfolio");
    expect(safeNext(null)).toBe("/portfolio");
  });
});

describe("authErrorMessage", () => {
  it("maps Supabase errors to friendly text", () => {
    expect(authErrorMessage({ message: "Invalid login credentials" })).toBe(messages.auth.badLogin);
    expect(authErrorMessage({ message: "User already registered" })).toBe(messages.auth.emailTaken);
    expect(authErrorMessage({ message: "x", status: 429 })).toBe(messages.auth.tooManyTries);
  });
});
