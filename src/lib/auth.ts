import "server-only";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "ft_session";
/** 90 days: phones behind a VPN, re-typing the password often adds little. */
const SESSION_DAYS = 90;

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = await scryptAsync(password, Buffer.from(salt, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Tailscale serves HTTPS; plain http only happens in local development.
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Cached per request so pages and actions can call it freely. */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, username: true, displayName: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
});

/** Every page and server action calls this: the proxy only checks that a cookie exists, not that it is valid. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Failed logins per username, kept in memory: the app is only reachable over the VPN, so this only has to stop someone
 * guessing a coworker's password from a lost phone, not a distributed attack.
 */
const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

export function isLockedOut(username: string, now = Date.now()) {
  const entry = failures.get(username);
  return !!entry && entry.count >= MAX_FAILURES && entry.until > now;
}

export function recordLoginFailure(username: string, now = Date.now()) {
  const entry = failures.get(username);
  const count = entry && entry.until > now ? entry.count + 1 : 1;
  failures.set(username, { count, until: now + LOCK_MS });
}

export function clearLoginFailures(username: string) {
  failures.delete(username);
}
