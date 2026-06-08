function requireEnv(name: string, fallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} is required in production`);
  }
  return fallback;
}

export function getApiBase(): string {
  return requireEnv("NEXT_PUBLIC_API_URL", "http://localhost:3001/api/v1");
}

export function getApiOrigin(): string {
  return getApiBase().replace(/\/api\/v1\/?$/, "");
}

export function getWsUrl(): string {
  return requireEnv("NEXT_PUBLIC_WS_URL", "http://localhost:3001");
}
