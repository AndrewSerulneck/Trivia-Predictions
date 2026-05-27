export type PasskeyErrorCode =
  | "PASSKEY_DISABLED"
  | "SERVER_MISCONFIG"
  | "INVALID_REQUEST"
  | "ORIGIN_NOT_ALLOWED"
  | "RP_ID_NOT_ALLOWED"
  | "USER_NOT_FOUND"
  | "AUTH_FAILED"
  | "NO_PASSKEYS"
  | "CHALLENGE_EXPIRED"
  | "CHALLENGE_USER_MISMATCH"
  | "CREDENTIAL_NOT_FOUND"
  | "VERIFICATION_FAILED"
  | "RATE_LIMITED"
  | "UNKNOWN";

export function getPasskeyClientMessage(code: string | undefined, fallback: string): string {
  switch (String(code ?? "").trim()) {
    case "PASSKEY_DISABLED":
      return "Passkey login is temporarily unavailable.";
    case "SERVER_MISCONFIG":
      return "Passkey setup is unavailable right now. Please try again shortly.";
    case "INVALID_REQUEST":
      return "Passkey request was invalid. Please retry.";
    case "ORIGIN_NOT_ALLOWED":
      return "This browser origin is not allowed for passkeys on this environment.";
    case "RP_ID_NOT_ALLOWED":
      return "Passkey domain configuration is invalid for this environment.";
    case "USER_NOT_FOUND":
      return "We couldn't find your profile for passkey setup.";
    case "AUTH_FAILED":
      return "Passkey sign-in failed. Please use your PIN.";
    case "NO_PASSKEYS":
      return "No passkey is enrolled yet. Use your PIN, then set up a passkey.";
    case "CHALLENGE_EXPIRED":
      return "Passkey request expired. Please try again.";
    case "CHALLENGE_USER_MISMATCH":
      return "Passkey request did not match your account. Please retry.";
    case "CREDENTIAL_NOT_FOUND":
      return "No matching passkey was found for this account.";
    case "VERIFICATION_FAILED":
      return "Passkey verification failed. Please try again.";
    case "RATE_LIMITED":
      return "Too many passkey attempts. Please wait and try again.";
    default:
      return fallback;
  }
}
