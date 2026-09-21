import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentStaff } from '@/lib/auth';
import { isValidYearMonth, recordActualCount } from '@/lib/inventory';

type InputRecord = { itemId: number; actualCount: number };

export async function POST(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const yearMonth = body?.yearMonth;
  const inputRecords = Array.isArray(body?.records) ? body.records : null;

  if (!isValidYearMonth(yearMonth) || !inputRecords || inputRecords.length === 0) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 });
  }

  const results: { itemId: number; ok: boolean; error?: string; record?: unknown }[] = [];

  for (const entry of inputRecords as InputRecord[]) {
    const itemId = Number(entry?.itemId);
    const actualCount = Number(entry?.actualCount);

    if (!Number.isFinite(itemId) || !Number.isFinite(actualCount) || actualCount < 0) {
      results.push({ itemId, ok: false, error: '입력값이 올바르지 않습니다.' });
      continue;
    }

    const item = await db.item.findUnique({ where: { id: itemId } });
    if (!item) {
      results.push({ itemId, ok: false, error: '품목을 찾을 수 없습니다.' });
      continue;
    }

    const record = await recordActualCount(itemId, yearMonth, actualCount, staff.id);
    results.push({ itemId, ok: true, record });
  }

  return NextResponse.json({ ok: true, results, submittedByName: staff.name });
}
