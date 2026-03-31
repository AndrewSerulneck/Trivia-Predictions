export type AdminCredential = {
  username: string;
  password: string;
};

const STATIC_ADMIN_CREDENTIALS: AdminCredential[] = [
  {
    username: "marc",
    password: "MeMarc25",
  },
];

export function getConfiguredAdminCredentials(): AdminCredential[] {
  const credentials: AdminCredential[] = [];

  const configuredUsername = process.env.ADMIN_LOGIN_USERNAME?.trim();
  const configuredPassword = process.env.ADMIN_LOGIN_PASSWORD?.trim();
  if (configuredUsername && configuredPassword) {
    credentials.push({ username: configuredUsername, password: configuredPassword });
  }

  for (const credential of STATIC_ADMIN_CREDENTIALS) {
    const exists = credentials.some(
      (item) => item.username === credential.username && item.password === credential.password
    );
    if (!exists) {
      credentials.push(credential);
    }
  }

  return credentials;
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
