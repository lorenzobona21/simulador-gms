export type BasicAuthCredential = {
  username: string;
  password: string;
};

type AuthEnvironment = Record<string, string | undefined>;

export function basicAuthCredentialsFromEnv(env: AuthEnvironment): BasicAuthCredential[] {
  const candidates = [
    [env.APP_LOGIN_USERNAME, env.APP_LOGIN_PASSWORD],
    [env.APP_LOGIN_SECONDARY_USERNAME, env.APP_LOGIN_SECONDARY_PASSWORD]
  ];

  return candidates.flatMap(([username, password]) =>
    username && password ? [{ username, password }] : []
  );
}

export function matchesBasicAuth(
  authorization: string | null,
  credentials: BasicAuthCredential[],
  decode = atob
) {
  if (!authorization?.startsWith("Basic ")) return false;

  try {
    const decoded = decode(authorization.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;

    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);

    return credentials.some(
      (credential) => credential.username === username && credential.password === password
    );
  } catch {
    return false;
  }
}
