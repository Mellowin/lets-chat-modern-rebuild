import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getApiBase, getApiOrigin, getWsUrl } from "./env";

describe("env helpers", () => {
  let originalApiUrl: string | undefined;
  let originalWsUrl: string | undefined;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    const env = process.env as Record<string, string | undefined>;
    originalApiUrl = env.NEXT_PUBLIC_API_URL;
    originalWsUrl = env.NEXT_PUBLIC_WS_URL;
    originalNodeEnv = env.NODE_ENV;
    delete env.NEXT_PUBLIC_API_URL;
    delete env.NEXT_PUBLIC_WS_URL;
  });

  afterEach(() => {
    const env = process.env as Record<string, string | undefined>;
    env.NEXT_PUBLIC_API_URL = originalApiUrl;
    env.NEXT_PUBLIC_WS_URL = originalWsUrl;
    env.NODE_ENV = originalNodeEnv;
  });

  describe("getApiBase", () => {
    it("returns NEXT_PUBLIC_API_URL without trailing slash", () => {
      process.env.NEXT_PUBLIC_API_URL = "https://api.example.com/api/v1/";
      expect(getApiBase()).toBe("https://api.example.com/api/v1");
    });

    it("returns localhost fallback in development", () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "development";
      expect(getApiBase()).toBe("http://localhost:3001/api/v1");
    });

    it("throws in production when NEXT_PUBLIC_API_URL is missing", () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      expect(() => getApiBase()).toThrow("NEXT_PUBLIC_API_URL is required in production");
    });
  });

  describe("getApiOrigin", () => {
    it("strips /api/v1 from NEXT_PUBLIC_API_URL", () => {
      process.env.NEXT_PUBLIC_API_URL = "https://lets-chat-api-v2.onrender.com/api/v1";
      expect(getApiOrigin()).toBe("https://lets-chat-api-v2.onrender.com");
    });

    it("strips /api/v1/ with trailing slash", () => {
      process.env.NEXT_PUBLIC_API_URL = "https://api.example.com/api/v1/";
      expect(getApiOrigin()).toBe("https://api.example.com");
    });
  });

  describe("getWsUrl", () => {
    it("returns NEXT_PUBLIC_WS_URL without trailing slash", () => {
      process.env.NEXT_PUBLIC_WS_URL = "https://ws.example.com/";
      expect(getWsUrl()).toBe("https://ws.example.com");
    });

    it("derives WebSocket URL from NEXT_PUBLIC_API_URL when WS_URL is not set", () => {
      process.env.NEXT_PUBLIC_API_URL = "https://lets-chat-api-v2.onrender.com/api/v1";
      expect(getWsUrl()).toBe("https://lets-chat-api-v2.onrender.com");
    });

    it("ignores NEXT_PUBLIC_WS_URL when it points to deprecated wa43 host", () => {
      process.env.NEXT_PUBLIC_API_URL = "https://lets-chat-api-v2.onrender.com/api/v1";
      process.env.NEXT_PUBLIC_WS_URL = "https://lets-chat-api-wa43.onrender.com";
      expect(getWsUrl()).toBe("https://lets-chat-api-v2.onrender.com");
    });

    it("returns localhost fallback in development", () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "development";
      expect(getWsUrl()).toBe("http://localhost:3001");
    });
  });
});
