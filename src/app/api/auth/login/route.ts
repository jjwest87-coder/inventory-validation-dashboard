import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { setSessionCookie } from '@/lib/auth';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!id || !password) {
    return NextResponse.json({ error: '사번과 비밀번호를 입력해주세요.' }, { status: 400 });
  }

  const staff = await db.staff.findUnique({ where: { id } });
  if (!staff || !staff.active) {
    return NextResponse.json({ error: '사번 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  const ok = await bcrypt.compare(password, staff.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: '사번 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  await setSessionCookie(staff.id);

  return NextResponse.json({ ok: true, role: staff.role, name: staff.name });
}
