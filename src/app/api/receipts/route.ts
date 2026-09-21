import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentStaff } from '@/lib/auth';
import { isValidYearMonth } from '@/lib/inventory';

type InputReceipt = {
  itemId: number;
  receivedQty: number;
  receivedDate: string;
  hasPackingSlip?: boolean;
  note?: string;
};

export async function POST(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const targetYearMonth = body?.targetYearMonth;
  const inputReceipts = Array.isArray(body?.receipts) ? body.receipts : null;

  if (!isValidYearMonth(targetYearMonth) || !inputReceipts || inputReceipts.length === 0) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 });
  }

  const results: { itemId: number; ok: boolean; error?: string; receipt?: unknown }[] = [];

  for (const entry of inputReceipts as InputReceipt[]) {
    const itemId = Number(entry?.itemId);
    const receivedQty = Number(entry?.receivedQty);
    const receivedDate = typeof entry?.receivedDate === 'string' ? entry.receivedDate : '';
    const hasPackingSlip = Boolean(entry?.hasPackingSlip);
    const note = typeof entry?.note === 'string' && entry.note.trim() ? entry.note.trim() : null;

    if (
      !Number.isFinite(itemId) ||
      !Number.isFinite(receivedQty) ||
      receivedQty <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)
    ) {
      results.push({ itemId, ok: false, error: '입력값이 올바르지 않습니다.' });
      continue;
    }

    const order = await db.purchaseOrder.findUnique({
      where: { itemId_targetYearMonth: { itemId, targetYearMonth } },
    });
    if (!order) {
      results.push({ itemId, ok: false, error: '먼저 발주 수량을 입력해주세요.' });
      continue;
    }

    const receipt = await db.receipt.create({
      data: { purchaseOrderId: order.id, receivedQty, receivedDate, hasPackingSlip, recordedBy: staff.id, note },
    });

    results.push({ itemId, ok: true, receipt });
  }

  return NextResponse.json({ ok: true, results, recordedByName: staff.name });
}

export async function PATCH(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const receiptId = Number(body?.receiptId);
  if (!Number.isFinite(receiptId)) {
    return NextResponse.json({ error: '입고 기록을 찾을 수 없습니다.' }, { status: 400 });
  }

  const existing = await db.receipt.findUnique({ where: { id: receiptId } });
  if (!existing) return NextResponse.json({ error: '입고 기록을 찾을 수 없습니다.' }, { status: 404 });

  const data: { receivedQty?: number; receivedDate?: string; hasPackingSlip?: boolean; note?: string | null } = {};

  if ('receivedQty' in body) {
    const receivedQty = Number(body.receivedQty);
    if (!Number.isFinite(receivedQty) || receivedQty <= 0) {
      return NextResponse.json({ error: '입고 수량이 올바르지 않습니다.' }, { status: 400 });
    }
    data.receivedQty = receivedQty;
  }
  if ('receivedDate' in body) {
    const receivedDate = typeof body.receivedDate === 'string' ? body.receivedDate : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)) {
      return NextResponse.json({ error: '입고일이 올바르지 않습니다.' }, { status: 400 });
    }
    data.receivedDate = receivedDate;
  }
  if ('hasPackingSlip' in body) data.hasPackingSlip = Boolean(body.hasPackingSlip);
  if ('note' in body) data.note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;

  const updated = await db.receipt.update({ where: { id: receiptId }, data });

  await db.auditLog.create({
    data: {
      actorId: staff.id,
      action: 'receipt.update',
      detail: `receipt #${receiptId} 수정 (수량 ${existing.receivedQty}->${updated.receivedQty}, 날짜 ${existing.receivedDate}->${updated.receivedDate})`,
    },
  });

  return NextResponse.json({ ok: true, receipt: updated });
}

export async function DELETE(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const receiptId = Number(body?.receiptId);
  if (!Number.isFinite(receiptId)) {
    return NextResponse.json({ error: '입고 기록을 찾을 수 없습니다.' }, { status: 400 });
  }

  const existing = await db.receipt.findUnique({ where: { id: receiptId } });
  if (!existing) return NextResponse.json({ error: '입고 기록을 찾을 수 없습니다.' }, { status: 404 });

  await db.receipt.delete({ where: { id: receiptId } });

  await db.auditLog.create({
    data: {
      actorId: staff.id,
      action: 'receipt.delete',
      detail: `receipt #${receiptId} 삭제 (수량 ${existing.receivedQty}, 날짜 ${existing.receivedDate})`,
    },
  });

  return NextResponse.json({ ok: true });
}
