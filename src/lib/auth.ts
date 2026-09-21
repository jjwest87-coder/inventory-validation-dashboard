import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';
import { db } from '@/lib/db';

const COOKIE_NAME = 'session';
const SECRET = process.env.SESSION_SECRET ?? 'dev-only-insecure-secret';

function sign(staffId: string) {
  return createHmac('sha256', SECRET).update(staffId).digest('hex');
}

export function makeSessionToken(staffId: string) {
  return `${staffId}.${sign(staffId)}`;
}

function verifySessionToken(token: string): string | null {
  const idx = token.lastIndexOf('.');
  if (idx === -1) return null;
  const staffId = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(staffId);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return staffId;
}

export async function setSessionCookie(staffId: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, makeSessionToken(staffId), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getCurrentStaff() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const staffId = verifySessionToken(token);
  if (!staffId) return null;
  const staff = await db.staff.findUnique({ where: { id: staffId } });
  if (!staff || !staff.active) return null;
  return staff;
}
