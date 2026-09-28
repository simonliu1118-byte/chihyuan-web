import type {
  IdentityAdapter,
  IdentityPrincipal,
  IdentityResolution,
  SharedIdentityRole,
} from "./contract";
import type { IdentityLoginMetadata } from "./login-provider";

export const CYWEB_SESSION_COOKIE = "cyweb_session";
export const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60;

interface SessionRow {
  identity_employee_id: string;
  employee_no: string | null;
  employee_name: string;
  role: string;
  workspace_id: string | null;
  expires_at: string;
}

export interface CreatedIdentitySession {
  token: string;
  expiresAt: string;
  setCookie: string;
}

function isRole(value: string): value is SharedIdentityRole {
  return value === "EMPLOYEE" || value === "ADMIN" || value === "SUPER_ADMIN";
}

function cookieValue(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes, (part) => part.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function sessionCookie(token: string, maxAge: number): string {
  return `${CYWEB_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearSessionCookie(): string {
  return `${CYWEB_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function createIdentitySession(
  db: D1Database,
  principal: IdentityPrincipal,
  metadata: IdentityLoginMetadata,
  options: { now?: Date; ttlSeconds?: number } = {},
): Promise<CreatedIdentitySession> {
  const now = options.now ?? new Date();
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 24 * 60 * 60) {
    throw new Error("IDENTITY_SESSION_TTL_INVALID");
  }

  const token = randomToken();
  const sessionHash = await sha256Hex(token);
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

  await db.batch([
    db.prepare("DELETE FROM web_sessions WHERE expires_at <= ?1").bind(createdAt),
    db.prepare(`
      INSERT INTO web_sessions(
        session_hash,
        identity_employee_id,
        employee_no,
        employee_name,
        role,
        workspace_id,
        credential_version,
        employee_revision,
        created_at,
        expires_at
      ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
    `).bind(
      sessionHash,
      principal.employeeId,
      principal.employeeNo,
      principal.displayName,
      principal.role,
      principal.workspaceId,
      metadata.credentialVersion,
      metadata.employeeRevision,
      createdAt,
      expiresAt,
    ),
  ]);

  return {
    token,
    expiresAt,
    setCookie: sessionCookie(token, ttlSeconds),
  };
}

export async function destroyIdentitySession(db: D1Database, request: Request): Promise<void> {
  const token = cookieValue(request, CYWEB_SESSION_COOKIE);
  if (!token || token.length > 128) return;
  const sessionHash = await sha256Hex(token);
  await db.prepare("DELETE FROM web_sessions WHERE session_hash = ?1").bind(sessionHash).run();
}

export class D1SessionIdentityAdapter implements IdentityAdapter {
  constructor(
    private readonly db: D1Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async resolve(request: Request): Promise<IdentityResolution> {
    const token = cookieValue(request, CYWEB_SESSION_COOKIE);
    if (!token) return { status: "unauthenticated", reason: "missing" };
    if (token.length > 128 || !/^[A-Za-z0-9_-]+$/.test(token)) {
      return { status: "unauthenticated", reason: "invalid" };
    }

    const sessionHash = await sha256Hex(token);
    let row: SessionRow | null;
    try {
      row = await this.db.prepare(`
        SELECT identity_employee_id, employee_no, employee_name, role, workspace_id, expires_at
          FROM web_sessions
         WHERE session_hash = ?1
           AND expires_at > ?2
         LIMIT 1
      `).bind(sessionHash, this.now().toISOString()).first<SessionRow>();
    } catch {
      return { status: "unavailable" };
    }

    if (!row || !isRole(row.role)) {
      return { status: "unauthenticated", reason: "invalid" };
    }

    return {
      status: "authenticated",
      principal: {
        employeeId: row.identity_employee_id,
        employeeNo: row.employee_no,
        displayName: row.employee_name,
        role: row.role,
        workspaceId: row.workspace_id,
      },
    };
  }
}
