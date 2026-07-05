import { openDatabase, type DB } from "./db/index.js";
import { createApiKey } from "./core/apiKeys.js";
import type { ArtifactServiceDeps } from "./core/artifacts.js";
import type { AppConfig } from "./config.js";

export const TEST_CONTENT_BASE = "http://content.localhost:8787";
export const TEST_CONTROL_BASE = "http://localhost:8787";

/** Fresh in-memory DB with schema applied. */
export function memDb(): DB {
  return openDatabase(":memory:");
}

export function testDeps(db: DB): ArtifactServiceDeps {
  return {
    db,
    contentBaseUrl: TEST_CONTENT_BASE,
    maxHtmlBytes: 1024 * 1024,
    defaultCspMode: "strict",
  };
}

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 8787,
    controlBaseUrl: TEST_CONTROL_BASE,
    contentBaseUrl: TEST_CONTENT_BASE,
    controlOrigin: "http://localhost:8787",
    contentOrigin: "http://content.localhost:8787",
    contentHost: "content.localhost:8787",
    dbPath: ":memory:",
    maxHtmlBytes: 1024 * 1024,
    publishRatePerMin: 1000,
    defaultCspMode: "strict",
    allowSameOrigin: false,
    ...overrides,
  };
}

/** Creates a key and returns both its record id and usable plaintext. */
export function seedKey(db: DB, label = "test") {
  return createApiKey(db, label);
}
