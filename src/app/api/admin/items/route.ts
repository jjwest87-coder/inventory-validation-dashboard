import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentStaff } from '@/lib/auth';

export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== 'MASTER') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }
  // Admin view shows inactive items too, so they can be reactivated or permanently removed.
  const items = await db.item.findMany({
    orderBy: { code: 'asc' },
    include: { assignee: true, supplier: true },
  });
  return NextResponse.json({
    items: items.map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      spec: i.spec,
      type: i.type,
      manufacturer: i.manufacturer,
      assigneeId: i.assigneeId,
      assigneeName: i.assignee?.name ?? null,
      supplierId: i.supplierId,
      supplierName: i.supplier?.name ?? null,
      orderMultiple: i.orderMultiple,
      note: i.note,
      active: i.active,
    })),
  });
}

function parseOrderMultiple(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return n;
}

export async function POST(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== 'MASTER') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const spec = typeof body?.spec === 'string' ? body.spec.trim() : null;
  const type = typeof body?.type === 'string' ? body.type.trim() : null;
  const manufacturer = typeof body?.manufacturer === 'string' ? body.manufacturer.trim() : null;
  const assigneeId = typeof body?.assigneeId === 'string' && body.assigneeId ? body.assigneeId : null;
  const supplierId = Number.isFinite(Number(body?.supplierId)) && body?.supplierId ? Number(body.supplierId) : null;
  const orderMultiple = parseOrderMultiple(body?.orderMultiple);
  const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim() : null;

  if (!code || !name) {
    return NextResponse.json({ error: '품목코드와 품목명을 입력해주세요.' }, { status: 400 });
  }

  const existing = await db.item.findUnique({ where: { code } });
  if (existing) {
    return NextResponse.json({ error: '이미 존재하는 품목코드입니다.' }, { status: 409 });
  }

  const created = await db.item.create({
    data: { code, name, spec, type, manufacturer, assigneeId, supplierId, orderMultiple, note },
  });

  await db.auditLog.create({
    data: { actorId: staff.id, action: 'item.create', detail: `${code} (${name}) 추가` },
  });

  return NextResponse.json({ ok: true, item: created });
}

export async function PATCH(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== 'MASTER') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const itemId = Number(body?.itemId);

  if (!Number.isFinite(itemId)) {
    return NextResponse.json({ error: '품목을 찾을 수 없습니다.' }, { status: 400 });
  }

  const item = await db.item.findUnique({ where: { id: itemId } });
  if (!item) return NextResponse.json({ error: '품목을 찾을 수 없습니다.' }, { status: 404 });

  const data: {
    assigneeId?: string | null;
    supplierId?: number | null;
    orderMultiple?: number | null;
    note?: string | null;
    active?: boolean;
  } = {};
  const logs: string[] = [];

  if ('assigneeId' in body) {
    const assigneeId = typeof body.assigneeId === 'string' && body.assigneeId ? body.assigneeId : null;
    data.assigneeId = assigneeId;
    logs.push(`담당자 변경 -> ${assigneeId ?? '없음'}`);
  }
  if ('supplierId' in body) {
    const supplierId = Number.isFinite(Number(body.supplierId)) && body.supplierId ? Number(body.supplierId) : null;
    data.supplierId = supplierId;
    logs.push(`입고처 변경 -> ${supplierId ?? '없음'}`);
  }
  if ('orderMultiple' in body) {
    const orderMultiple = parseOrderMultiple(body.orderMultiple);
    data.orderMultiple = orderMultiple;
    logs.push(`발주 단위 변경 -> ${orderMultiple ?? '없음'}`);
  }
  if ('note' in body) {
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
    data.note = note;
    logs.push('비고 수정');
  }
  if ('active' in body) {
    data.active = Boolean(body.active);
    logs.push(data.active ? '복원' : '비활성화');
  }

  const updated = await db.item.update({ where: { id: itemId }, data });

  await db.auditLog.create({
    data: { actorId: staff.id, action: 'item.update', detail: `${item.code} ${logs.join(', ')}` },
  });

  return NextResponse.json({ ok: true, item: updated });
}

export async function DELETE(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== 'MASTER') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const itemId = Number(body?.itemId);
  if (!Number.isFinite(itemId)) {
    return NextResponse.json({ error: '품목을 찾을 수 없습니다.' }, { status: 400 });
  }

  const item = await db.item.findUnique({ where: { id: itemId } });
  if (!item) return NextResponse.json({ error: '품목을 찾을 수 없습니다.' }, { status: 404 });

  const result = await db.item.remove(itemId);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  await db.auditLog.create({
    data: { actorId: staff.id, action: 'item.delete', detail: `${item.code} (${item.name}) 삭제` },
  });

  return NextResponse.json({ ok: true });
}
