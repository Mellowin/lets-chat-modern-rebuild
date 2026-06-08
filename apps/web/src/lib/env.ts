const API_BASE = process.env.NEXT_PUBLIC_API_URL;
const WS_URL = process.env.NEXT_PUBLIC_WS_URL;

export function getApiBase(): string {
  if (API_BASE) {
    return API_BASE.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_API_URL is required in production");
  }
  return "http://localhost:3001/api/v1";
}

export function getApiOrigin(): string {
  return getApiBase().replace(/\/api\/v1\/?$/, "");
}

export function getWsUrl(): string {
  if (WS_URL) {
    return WS_URL.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_WS_URL is required in production");
  }
  return "http://localhost:3001";
}
