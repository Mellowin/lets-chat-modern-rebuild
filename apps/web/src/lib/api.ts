import { getApiBase } from "./env";

const API_BASE = getApiBase();

export interface HealthResponse {
  status: "ok" | "degraded";
  timestamp: string;
  uptime: number;
  environment: string;
  database: "ok" | "error";
  requestId: string;
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<HealthResponse>;
}
