"use client";

import { useState } from "react";
import { getApiBase } from "@/lib/env";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

const LOCAL_API_BASE = "http://localhost:3001/api/v1";
const LOCAL_WS_URL = "ws://localhost:3001";

function isLocalApi(url: string) {
  return url.startsWith("http://localhost:3001") || url.startsWith("http://127.0.0.1:3001");
}

export default function LocalApiHint() {
  const [apiBase] = useState<string | null>(() =>
    typeof window === "undefined" ? null : getApiBase(),
  );

  if (!apiBase || isLocalApi(apiBase)) return null;

  return (
    <Card className="mb-6 w-full max-w-sm border-amber-200 bg-amber-50">
      <CardHeader>
        <CardTitle className="text-base text-amber-900">Using deployed API</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-amber-800">
        <p>
          This page is currently calling{" "}
          <code className="rounded bg-amber-100 px-1 py-0.5">{apiBase}</code>. That server is often
          asleep or unavailable, which produces the “server is taking too long” error.
        </p>
        <p>
          To develop against your local API, switch to localhost. After switching, Chrome/Edge may
          ask for permission to access your local network — choose <strong>Allow</strong>.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              localStorage.setItem("letsChatApiUrl", LOCAL_API_BASE);
              localStorage.setItem("letsChatWsUrl", LOCAL_WS_URL);
              location.reload();
            }}
          >
            Use local API (localhost:3001)
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set("apiUrl", LOCAL_API_BASE);
              url.searchParams.set("wsUrl", LOCAL_WS_URL);
              window.location.href = url.toString();
            }}
          >
            Reload with query params
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
