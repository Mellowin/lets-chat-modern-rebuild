import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { getApiBase, getApiOrigin, getWsUrl } from "./env";

function createMockStorage() {
  const store: Record<string, string | null> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    _store: store,
  };
}

describe("env helpers", () => {
  let originalApiUrl: string | undefined;
  let originalWsUrl: string | undefined;
  let originalNodeEnv: string | undefined;
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    const env = process.env as Record<string, string | undefined>;
    originalApiUrl = env.NEXT_PUBLIC_API_URL;
    originalWsUrl = env.NEXT_PUBLIC_WS_URL;
    originalNodeEnv = env.NODE_ENV;
    delete env.NEXT_PUBLIC_API_URL;
    delete env.NEXT_PUBLIC_WS_URL;

    mockStorage = createMockStorage();
    vi.stubGlobal("localStorage", mockStorage);
    vi.stubGlobal("location", { search: "" });
  });

  afterEach(() => {
    const env = process.env as Record<string, string | undefined>;
    env.NEXT_PUBLIC_API_URL = originalApiUrl;
    env.NEXT_PUBLIC_WS_URL = originalWsUrl;
    env.NODE_ENV = originalNodeEnv;
    vi.unstubAllGlobals();
  });

  describe("getApiBase", () => {
    it("returns NEXT_PUBLIC_API_URL without trailing slash", () => {
      process.env.NEXT_PUBLIC_API_URL = "https://api.example.com/api/v1/";
      expect(getApiBase()).toBe("https://api.example.com/api/v1");
    });

    it("returns localhost fallback in development", () => {
      (process.env as Record<string, string | undefined>).NODE_ENV =
        "development";
      expect(getApiBase()).toBe("http://localhost:3001/api/v1");
    });

    it("throws in production when NEXT_PUBLIC_API_URL is missing", () => {
      (process.env as Record<string, string | undefined>).NODE_ENV =
        "production";
      expect(() => getApiBase()).toThrow(
        "NEXT_PUBLIC_API_URL is required in production",
      );
    });

    it("returns localStorage API URL override when set", () => {
      process.env.NEXT_PUBLIC_API_URL = "https://api.example.com/api/v1";
      mockStorage.setItem("letsChatApiUrl", "http://localhost:3001/api/v1");
      expect(getApiBase()).toBe("http://localhost:3001/api/v1");
    });

    it("ignores invalid localStorage override and falls back to env", () => {
      process.env.NEXT_PUBLIC_API_URL = "https://api.example.com/api/v1";
      mockStorage.setItem("letsChatApiUrl", "not-a-url");
      expect(getApiBase()).toBe("https://api.example.com/api/v1");
    });

    it("ignores localStorage override with disallowed protocol", () => {
      process.env.NEXT_PUBLIC_API_URL = "https://api.example.com/api/v1";
      mockStorage.setItem("letsChatApiUrl", "ftp://localhost:3001/api/v1");
      expect(getApiBase()).toBe("https://api.example.com/api/v1");
    });

    it("uses query param API URL override and persists it to localStorage", () => {
      process.env.NEXT_PUBLIC_API_URL = "https://api.example.com/api/v1";
      vi.stubGlobal("location", {
        search: "?apiUrl=http://localhost:3001/api/v1",
      });
      expect(getApiBase()).toBe("http://localhost:3001/api/v1");
      expect(mockStorage.getItem("letsChatApiUrl")).toBe(
        "http://localhost:3001/api/v1",
      );
    });

    it("query param wins over localStorage override", () => {
      process.env.NEXT_PUBLIC_API_URL = "https://api.example.com/api/v1";
      mockStorage.setItem("letsChatApiUrl", "http://old.local/api/v1");
      vi.stubGlobal("location", {
        search: "?apiUrl=http://new.local/api/v1",
      });
      expect(getApiBase()).toBe("http://new.local/api/v1");
    });
  });

  describe("getApiOrigin", () => {
    it("strips /api/v1 from NEXT_PUBLIC_API_URL", () => {
      process.env.NEXT_PUBLIC_API_URL =
        "https://lets-chat-api-v2.onrender.com/api/v1";
      expect(getApiOrigin()).toBe("https://lets-chat-api-v2.onrender.com");
    });

    it("strips /api/v1/ with trailing slash", () => {
      process.env.NEXT_PUBLIC_API_URL = "https://api.example.com/api/v1/";
      expect(getApiOrigin()).toBe("https://api.example.com");
    });

    it("respects API URL override", () => {
      process.env.NEXT_PUBLIC_API_URL = "https://api.example.com/api/v1";
      mockStorage.setItem("letsChatApiUrl", "http://localhost:3001/api/v1");
      expect(getApiOrigin()).toBe("http://localhost:3001");
    });
  });

  describe("getWsUrl", () => {
    it("returns NEXT_PUBLIC_WS_URL without trailing slash", () => {
      process.env.NEXT_PUBLIC_WS_URL = "https://ws.example.com/";
      expect(getWsUrl()).toBe("https://ws.example.com");
    });

    it("derives WebSocket URL from NEXT_PUBLIC_API_URL when WS_URL is not set", () => {
      process.env.NEXT_PUBLIC_API_URL =
        "https://lets-chat-api-v2.onrender.com/api/v1";
      expect(getWsUrl()).toBe("https://lets-chat-api-v2.onrender.com");
    });

    it("ignores NEXT_PUBLIC_WS_URL when it points to deprecated wa43 host", () => {
      process.env.NEXT_PUBLIC_API_URL =
        "https://lets-chat-api-v2.onrender.com/api/v1";
      process.env.NEXT_PUBLIC_WS_URL = "https://lets-chat-api-wa43.onrender.com";
      expect(getWsUrl()).toBe("https://lets-chat-api-v2.onrender.com");
    });

    it("returns localhost fallback in development", () => {
      (process.env as Record<string, string | undefined>).NODE_ENV =
        "development";
      expect(getWsUrl()).toBe("http://localhost:3001");
    });

    it("returns localStorage WS URL override when set", () => {
      process.env.NEXT_PUBLIC_WS_URL = "https://ws.example.com";
      mockStorage.setItem("letsChatWsUrl", "ws://localhost:3001");
      expect(getWsUrl()).toBe("ws://localhost:3001");
    });

    it("ignores invalid localStorage WS override and falls back to env", () => {
      process.env.NEXT_PUBLIC_WS_URL = "https://ws.example.com";
      mockStorage.setItem("letsChatWsUrl", "bad-url");
      expect(getWsUrl()).toBe("https://ws.example.com");
    });

    it("uses query param WS URL override and persists it to localStorage", () => {
      process.env.NEXT_PUBLIC_WS_URL = "https://ws.example.com";
      vi.stubGlobal("location", { search: "?wsUrl=ws://localhost:3001" });
      expect(getWsUrl()).toBe("ws://localhost:3001");
      expect(mockStorage.getItem("letsChatWsUrl")).toBe("ws://localhost:3001");
    });
  });
});
