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

export async function PATCH(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== 'MASTER') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  const role = body?.role === 'MASTER' ? 'MASTER' : body?.role === 'STAFF' ? 'STAFF' : null;

  if (!id || !role) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  if (id === staff.id) {
    return NextResponse.json({ error: '자신의 권한은 변경할 수 없습니다. 다른 마스터에게 요청하세요.' }, { status: 400 });
  }

  const target = await db.staff.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: '존재하지 않는 담당자입니다.' }, { status: 404 });
  }

  if (target.role === 'MASTER' && role === 'STAFF') {
    const all = await db.staff.findMany();
    const otherActiveMasters = all.filter((s) => s.role === 'MASTER' && s.active && s.id !== id);
    if (otherActiveMasters.length === 0) {
      return NextResponse.json({ error: '마지막 남은 마스터는 담당자로 변경할 수 없습니다.' }, { status: 400 });
    }
  }

  const updated = await db.staff.update({ where: { id }, data: { role } });

  await db.auditLog.create({
    data: { actorId: staff.id, action: 'staff.role_change', detail: `${id} (${target.name}) 권한을 ${role}(으)로 변경` },
  });

  return NextResponse.json({ ok: true, staff: { id: updated.id, name: updated.name, role: updated.role } });
}
