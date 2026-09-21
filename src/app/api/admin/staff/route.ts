import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { getCurrentStaff } from '@/lib/auth';

export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== 'MASTER') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }
  const all = await db.staff.findMany({ orderBy: { id: 'asc' } });
  return NextResponse.json({
    staff: all.map((s) => ({ id: s.id, name: s.name, role: s.role, active: s.active })),
  });
}

export async function POST(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== 'MASTER') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const role = body?.role === 'MASTER' ? 'MASTER' : 'STAFF';

  if (!id || !name) {
    return NextResponse.json({ error: '사번과 이름을 입력해주세요.' }, { status: 400 });
  }

  const existing = await db.staff.findUnique({ where: { id } });
  if (existing) {
    return NextResponse.json({ error: '이미 존재하는 사번입니다.' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash('1111', 10);
  const created = await db.staff.create({ data: { id, name, role, passwordHash } });

  await db.auditLog.create({
    data: { actorId: staff.id, action: 'staff.create', detail: `${id} (${name}) 추가` },
  });

  return NextResponse.json({ ok: true, staff: { id: created.id, name: created.name, role: created.role } });
}
