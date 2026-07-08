import { describe, it, expect } from "vitest";
import { localizeApiError } from "./api-errors";
import { ApiTimeoutError } from "./fetch-timeout";
import type { TranslationKey, Locale } from "./locale";
import { translate } from "./locale";

function t(locale: Locale = "en"): (key: TranslationKey) => string {
  return (key: TranslationKey) => translate(locale, key);
}

describe("localizeApiError", () => {
  it("returns timeout message for ApiTimeoutError", () => {
    const result = localizeApiError(
      new ApiTimeoutError(),
      "errors.generic",
      t(),
    );
    expect(result).toBe(
      "The server is taking too long to respond. It may be waking up. Please try again in a moment.",
    );
  });

  it("maps exact backend messages", () => {
    expect(
      localizeApiError(new Error("Invalid credentials"), "errors.generic", t()),
    ).toBe("Invalid email or password.");
    expect(
      localizeApiError(new Error("Validation failed"), "errors.generic", t()),
    ).toBe("Please check the entered data and try again.");
  });

  it("maps MAIL_PROVIDER_QUOTA_EXCEEDED code to registration unavailable", () => {
    const result = localizeApiError(
      new Error(
        "MAIL_PROVIDER_QUOTA_EXCEEDED: Email delivery is temporarily unavailable. Please try again later.",
      ),
      "auth.registrationFailed",
      t(),
    );
    expect(result).toBe(
      "Registration is temporarily unavailable. Please try again later.",
    );
  });

  it("maps safe backend message to registration unavailable", () => {
    const result = localizeApiError(
      new Error(
        "Email delivery is temporarily unavailable. Please try again later.",
      ),
      "auth.registrationFailed",
      t(),
    );
    expect(result).toBe(
      "Registration is temporarily unavailable. Please try again later.",
    );
  });

  it("maps MAIL_PROVIDER_UNAVAILABLE code to registration unavailable", () => {
    const result = localizeApiError(
      new Error(
        "MAIL_PROVIDER_UNAVAILABLE: Email delivery is temporarily unavailable. Please try again later.",
      ),
      "auth.registrationFailed",
      t(),
    );
    expect(result).toBe(
      "Registration is temporarily unavailable. Please try again later.",
    );
  });

  it("localizes registration unavailable in Russian", () => {
    const result = localizeApiError(
      new Error("MAIL_PROVIDER_QUOTA_EXCEEDED"),
      "auth.registrationFailed",
      t("ru"),
    );
    expect(result).toBe(
      "Регистрация временно недоступна. Попробуйте позже.",
    );
  });

  it("falls back to provided fallback key for unknown errors", () => {
    const result = localizeApiError(
      new Error("Some unknown problem"),
      "auth.registrationFailed",
      t(),
    );
    expect(result).toBe("Registration failed");
  });

  it("maps 'email already in use' to email already exists", () => {
    const result = localizeApiError(
      new Error("Email already in use"),
      "auth.registrationFailed",
      t(),
    );
    expect(result).toBe("This email is already registered.");
  });

  it("maps 'username already taken' to username already taken", () => {
    const result = localizeApiError(
      new Error("Username already taken"),
      "auth.registrationFailed",
      t(),
    );
    expect(result).toBe("This username is already taken.");
  });

  it("maps 'email not verified' to localized message", () => {
    const result = localizeApiError(
      new Error("Email not verified"),
      "auth.loginFailed",
      t(),
    );
    expect(result).toBe("Please verify your email before signing in.");
  });

  it("maps 'invalid or expired verification token' to invite expired message", () => {
    const result = localizeApiError(
      new Error("Invalid or expired verification token"),
      "auth.emailVerificationFailed",
      t(),
    );
    expect(result).toBe("Invite link is invalid or expired.");
  });

  it("falls back for non-Error values", () => {
    const result = localizeApiError(null, "errors.generic", t());
    expect(result).toBe("Something went wrong. Please try again.");
  });
});
