import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentStaff } from '@/lib/auth';

export async function POST(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const itemId = Number(body?.itemId);
  const lotNumber = typeof body?.lotNumber === 'string' ? body.lotNumber.trim() : null;
  const receivedDate = typeof body?.receivedDate === 'string' ? body.receivedDate.trim() : null;

  if (!Number.isFinite(itemId) || lotNumber === null || receivedDate === null || receivedDate.length > 20) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 });
  }

  const item = await db.item.findUnique({ where: { id: itemId } });
  if (!item) return NextResponse.json({ error: '품목을 찾을 수 없습니다.' }, { status: 404 });

  if (receivedDate === '') {
    await db.lotReceivedDate.delete({ where: { itemId, lotNumber } });
  } else {
    await db.lotReceivedDate.upsert({ data: { itemId, lotNumber, receivedDate, updatedBy: staff.id } });
  }

  return NextResponse.json({ ok: true });
}
