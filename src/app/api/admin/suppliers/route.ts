import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentStaff } from '@/lib/auth';

export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== 'MASTER') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }
  const suppliers = await db.supplier.findMany({ orderBy: { name: 'asc' } });
  return NextResponse.json({ suppliers });
}

export async function POST(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== 'MASTER') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const color = typeof body?.color === 'string' && body.color ? body.color : null;
  const contactName = typeof body?.contactName === 'string' && body.contactName.trim() ? body.contactName.trim() : null;
  const contactPhone =
    typeof body?.contactPhone === 'string' && body.contactPhone.trim() ? body.contactPhone.trim() : null;

  if (!name) {
    return NextResponse.json({ error: '입고처 이름을 입력해주세요.' }, { status: 400 });
  }

  const existing = (await db.supplier.findMany({})).find((s) => s.name === name);
  if (existing) {
    return NextResponse.json({ error: '이미 존재하는 입고처입니다.' }, { status: 409 });
  }

  const supplier = await db.supplier.create({ data: { name, color, contactName, contactPhone } });

  await db.auditLog.create({ data: { actorId: staff.id, action: 'supplier.create', detail: `${name} 추가` } });

  return NextResponse.json({ ok: true, supplier });
}

export async function PATCH(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== 'MASTER') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const supplierId = Number(body?.supplierId);
  if (!Number.isFinite(supplierId)) {
    return NextResponse.json({ error: '입고처를 찾을 수 없습니다.' }, { status: 400 });
  }

  const existing = await db.supplier.findUnique({ where: { id: supplierId } });
  if (!existing) return NextResponse.json({ error: '입고처를 찾을 수 없습니다.' }, { status: 404 });

  const data: { name?: string; color?: string | null; contactName?: string | null; contactPhone?: string | null } = {};
  if ('name' in body && typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
  if ('color' in body) data.color = typeof body.color === 'string' && body.color ? body.color : null;
  if ('contactName' in body)
    data.contactName = typeof body.contactName === 'string' && body.contactName.trim() ? body.contactName.trim() : null;
  if ('contactPhone' in body)
    data.contactPhone =
      typeof body.contactPhone === 'string' && body.contactPhone.trim() ? body.contactPhone.trim() : null;

  const updated = await db.supplier.update({ where: { id: supplierId }, data });

  await db.auditLog.create({
    data: { actorId: staff.id, action: 'supplier.update', detail: `${existing.name} 정보 수정` },
  });

  return NextResponse.json({ ok: true, supplier: updated });
}
