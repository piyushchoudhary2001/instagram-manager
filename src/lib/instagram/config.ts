import { createHmac, randomBytes } from "node:crypto";

/**
 * Credentials live in your .env.local and nowhere else. Nothing here returns a token to
 * the browser, writes one to a file, or puts one in an error message — `redact` runs over
 * everything that comes back from the API before it is shown or logged.
 */

export interface InstagramConfig {
  token: string;
  accountId: string;
  host: string;
  version: string;
  publicBase: string | null;
}

export interface ConfigState {
  ready: boolean;
  missing: string[];
  accountId: string | null;
  host: string;
  version: string;
  publicBase: string | null;
  login: "instagram" | "facebook";
}

const DEFAULT_VERSION = "v26.0";

function login(): "instagram" | "facebook" {
  return (process.env.INSTAGRAM_LOGIN ?? "instagram").toLowerCase() === "facebook" ? "facebook" : "instagram";
}

function host(): string {
  if (process.env.INSTAGRAM_API_HOST) return process.env.INSTAGRAM_API_HOST;
  return login() === "facebook" ? "graph.facebook.com" : "graph.instagram.com";
}

/** What is set, without ever reporting a value. */
export function configState(): ConfigState {
  const missing: string[] = [];
  if (!process.env.INSTAGRAM_ACCESS_TOKEN) missing.push("INSTAGRAM_ACCESS_TOKEN");
  if (!process.env.INSTAGRAM_ACCOUNT_ID) missing.push("INSTAGRAM_ACCOUNT_ID");
  return {
    ready: missing.length === 0,
    missing,
    accountId: process.env.INSTAGRAM_ACCOUNT_ID ?? null,
    host: host(),
    version: process.env.INSTAGRAM_API_VERSION ?? DEFAULT_VERSION,
    publicBase: process.env.PUBLIC_MEDIA_BASE_URL ?? null,
    login: login(),
  };
}

export class NotConfiguredError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super(`Instagram is not configured yet. Missing from .env.local: ${missing.join(", ")}`);
    this.name = "NotConfiguredError";
    this.missing = missing;
  }
}

export function instagramConfig(): InstagramConfig {
  const state = configState();
  if (!state.ready) throw new NotConfiguredError(state.missing);
  return {
    token: process.env.INSTAGRAM_ACCESS_TOKEN as string,
    accountId: state.accountId as string,
    host: state.host,
    version: state.version,
    publicBase: state.publicBase,
  };
}

/** Strip anything token-shaped out of text before it is shown, logged or stored. */
export function redact(text: string): string {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  let out = text;
  if (token && token.length > 8) out = out.split(token).join("[token]");
  out = out.replace(/access_token=[^&\s"']+/gi, "access_token=[token]");
  out = out.replace(/\b(IGAA|EAA)[A-Za-z0-9_-]{20,}\b/g, "[token]");
  return out;
}

/**
 * Signed URLs for the media Instagram has to fetch. The app has to be reachable from the
 * internet for a publish, so the media links are signed and short-lived rather than
 * guessable by anyone who finds the tunnel.
 */
let runtimeSecret: string | null = null;

function secret(): string {
  if (process.env.PUBLISH_MEDIA_SECRET) return process.env.PUBLISH_MEDIA_SECRET;
  if (!runtimeSecret) runtimeSecret = randomBytes(32).toString("hex");
  return runtimeSecret;
}

export function signMedia(postId: string, file: string, expiresAt: number): string {
  return createHmac("sha256", secret()).update(`${postId}/${file}:${expiresAt}`).digest("hex").slice(0, 32);
}

export function verifyMedia(postId: string, file: string, expiresAt: number, signature: string): boolean {
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  const expected = signMedia(postId, file, expiresAt);
  return expected.length === signature.length && createHmac("sha256", secret()).update(expected).digest("hex") === createHmac("sha256", secret()).update(signature).digest("hex");
}

export const MEDIA_TTL_MS = 30 * 60 * 1000;
