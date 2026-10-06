export type EnvCheck = {
  ok: boolean;
  present: string[];
  missing: string[];
};

export const requiredRuntimeEnv = [
  "NETFACTOR_URL",
  "NETFACTOR_USERNAME",
  "NETFACTOR_PASSWORD",
  "GMS_SYNC_SECRET",
  "APP_LOGIN_USERNAME",
  "APP_LOGIN_PASSWORD"
] as const;

export function checkRequiredEnv(keys = requiredRuntimeEnv): EnvCheck {
  const present: string[] = [];
  const missing: string[] = [];

  for (const key of keys) {
    if (process.env[key]) {
      present.push(key);
    } else {
      missing.push(key);
    }
  }

  return {
    ok: missing.length === 0,
    present,
    missing
  };
}
