import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentStaff } from '@/lib/auth';
import { isValidYearMonth, recordPurchaseOrder } from '@/lib/inventory';

type InputOrder = { itemId: number; orderedQty: number };

export async function POST(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const targetYearMonth = body?.targetYearMonth;
  const inputOrders = Array.isArray(body?.orders) ? body.orders : null;

  if (!isValidYearMonth(targetYearMonth) || !inputOrders || inputOrders.length === 0) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 });
  }

  const results: { itemId: number; ok: boolean; error?: string; order?: unknown }[] = [];

  for (const entry of inputOrders as InputOrder[]) {
    const itemId = Number(entry?.itemId);
    const orderedQty = Number(entry?.orderedQty);

    if (!Number.isFinite(itemId) || !Number.isFinite(orderedQty) || orderedQty < 0) {
      results.push({ itemId, ok: false, error: '입력값이 올바르지 않습니다.' });
      continue;
    }

    const item = await db.item.findUnique({ where: { id: itemId } });
    if (!item) {
      results.push({ itemId, ok: false, error: '품목을 찾을 수 없습니다.' });
      continue;
    }

    const order = await recordPurchaseOrder(itemId, targetYearMonth, orderedQty, staff.id);
    results.push({ itemId, ok: true, order });
  }

  return NextResponse.json({ ok: true, results });
}
