import crypto from "crypto";

const SESSION_COOKIE_NAME = "texperia_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type SessionPayload = {
  id: string;
  username: string;
  exp: number;
};

function getSessionSecret() {
  return process.env.AUTH_SESSION_SECRET || "texperia-dev-session-secret";
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payloadPart: string) {
  return crypto.createHmac("sha256", getSessionSecret()).update(payloadPart).digest("base64url");
}

function encodeToken(payload: SessionPayload) {
  const payloadPart = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(payloadPart);
  return `${payloadPart}.${signature}`;
}

function decodeToken(token: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadPart, signature] = parts;
  const expected = signPayload(payloadPart);
  if (signature !== expected) return null;

  try {
    const parsed = JSON.parse(fromBase64Url(payloadPart)) as SessionPayload;
    if (!parsed?.id || !parsed?.username || typeof parsed.exp !== "number") {
      return null;
    }
    if (Date.now() >= parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function appendSetCookie(res: any, cookie: string) {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", cookie);
    return;
  }
  if (Array.isArray(current)) {
    res.setHeader("Set-Cookie", [...current, cookie]);
    return;
  }
  res.setHeader("Set-Cookie", [String(current), cookie]);
}

function buildCookie(token: string, maxAgeSeconds: number) {
  const isSecure = process.env.NODE_ENV === "production";
  const securePart = isSecure ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${securePart}`;
}

export function setSessionCookie(res: any, user: { id: string; username: string }) {
  const payload: SessionPayload = {
    id: user.id,
    username: user.username,
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  appendSetCookie(res, buildCookie(encodeToken(payload), SESSION_TTL_SECONDS));
}

export function clearSessionCookie(res: any) {
  appendSetCookie(res, `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function parseCookies(headerValue: string | undefined) {
  const result: Record<string, string> = {};
  if (!headerValue) return result;
  const parts = headerValue.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    result[key] = val;
  }
  return result;
}

export function getSessionUser(req: any): { id: string; username: string } | null {
  const cookieHeader = (req.headers?.cookie || req.headers?.Cookie) as string | undefined;
  const cookies = parseCookies(cookieHeader);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;
  const payload = decodeToken(token);
  if (!payload) return null;
  return { id: payload.id, username: payload.username };
}

export function readJsonBody(req: any) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

