export type AdminCredential = {
  username: string;
  password: string;
};

export function getConfiguredAdminCredentials(): AdminCredential[] {
  const configuredUsername = process.env.ADMIN_LOGIN_USERNAME?.trim();
  const configuredPassword = process.env.ADMIN_LOGIN_PASSWORD?.trim();
  if (configuredUsername && configuredPassword) {
    return [{ username: configuredUsername, password: configuredPassword }];
  }
  return [];
}

export function findMatchingAdminCredential(params: {
  username?: string;
  password?: string;
}): AdminCredential | null {
  const username = (params.username ?? "").trim();
  const password = params.password ?? "";
  if (!username || !password) {
    return null;
  }

  const credentials = getConfiguredAdminCredentials();
  return credentials.find((item) => item.username === username && item.password === password) ?? null;
}
