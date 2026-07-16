import { test } from "node:test";
import assert from "node:assert/strict";
import type { Session } from "@supabase/supabase-js";
import {
  isUsableSession,
  readPersistedSession,
  sessionStorageKey,
  AUTH_BOOTSTRAP_TIMEOUT_MS,
} from "./authSession.ts";

const USER = { id: "user-1", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" };

function session(expiresAt: number | undefined): Session {
  return {
    access_token: "access",
    refresh_token: "refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    user: USER,
  } as unknown as Session;
}

test("null / undefined session is not usable", () => {
  assert.equal(isUsableSession(null), false);
  assert.equal(isUsableSession(undefined), false);
});

test("session without a user is not usable", () => {
  assert.equal(isUsableSession({ access_token: "x" } as unknown as Session), false);
});

test("session with a future expiry is usable", () => {
  const future = Math.floor(Date.now() / 1000) + 3600;
  assert.equal(isUsableSession(session(future)), true);
});

test("expired session that cannot be refreshed (dead backend) is not usable", () => {
  const past = Math.floor(Date.now() / 1000) - 60;
  assert.equal(isUsableSession(session(past)), false);
});

test("session without expires_at is treated as usable", () => {
  assert.equal(isUsableSession(session(undefined)), true);
});

test("bootstrap timeout is a small, finite bound", () => {
  assert.ok(Number.isFinite(AUTH_BOOTSTRAP_TIMEOUT_MS));
  assert.ok(AUTH_BOOTSTRAP_TIMEOUT_MS > 0 && AUTH_BOOTSTRAP_TIMEOUT_MS <= 8000);
});

test("sessionStorageKey derives sb-<ref>-auth-token from the Supabase URL", () => {
  assert.equal(
    sessionStorageKey("https://zrstaskwqwuxgelcrwxx.supabase.co"),
    "sb-zrstaskwqwuxgelcrwxx-auth-token",
  );
});

test("sessionStorageKey returns empty string for a malformed URL (safe fallback)", () => {
  assert.equal(sessionStorageKey(""), "");
  assert.equal(sessionStorageKey("not a url"), "");
});

// Storage stub compatible with the subset used by readPersistedSession.
function stubStorage(entries: Record<string, string>): Pick<Storage, "getItem"> {
  return { getItem: (k: string) => (k in entries ? entries[k] : null) };
}

test("readPersistedSession returns a valid persisted session (raw format)", () => {
  const key = "sb-ref-auth-token";
  const stored = JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: 999, user: USER });
  const out = readPersistedSession(stubStorage({ [key]: stored }), key);
  assert.equal(out?.user.id, "user-1");
});

test("readPersistedSession unwraps a legacy { currentSession } envelope", () => {
  const key = "sb-ref-auth-token";
  const stored = JSON.stringify({ currentSession: { access_token: "a", user: USER }, expiresAt: 999 });
  const out = readPersistedSession(stubStorage({ [key]: stored }), key);
  assert.equal(out?.user.id, "user-1");
});

test("readPersistedSession returns null for missing key, bad JSON, or wrong shape", () => {
  const key = "sb-ref-auth-token";
  assert.equal(readPersistedSession(stubStorage({}), key), null);
  assert.equal(readPersistedSession(stubStorage({ [key]: "{not json" }), key), null);
  assert.equal(readPersistedSession(stubStorage({ [key]: JSON.stringify({ foo: 1 }) }), key), null);
  assert.equal(readPersistedSession(null, key), null);
});
