export const OWNER_RESET_PASSWORD_PATH = "/owner/reset-password";

export const ownerRecoveryRedirectHref = (pathname: string, hash: string): string | null => {
  if (pathname === OWNER_RESET_PASSWORD_PATH) {
    return null;
  }

  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return null;
  }

  const params = new URLSearchParams(normalizedHash);
  if (params.get("type") !== "recovery" || !params.get("access_token")) {
    return null;
  }

  return `${OWNER_RESET_PASSWORD_PATH}#${normalizedHash}`;
};
