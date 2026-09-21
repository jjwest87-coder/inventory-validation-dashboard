import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentStaff } from '@/lib/auth';
import { isValidYearMonth, recordLotCounts } from '@/lib/inventory';

type InputEntry = { itemId: number; lotCounts: { lotId: number; count: number }[] };

export async function POST(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const yearMonth = body?.yearMonth;
  const entries = Array.isArray(body?.entries) ? body.entries : null;

  if (!isValidYearMonth(yearMonth) || !entries || entries.length === 0) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 });
  }

  const results: { itemId: number; ok: boolean; error?: string; record?: unknown }[] = [];

  for (const entry of entries as InputEntry[]) {
    const itemId = Number(entry?.itemId);
    const lotCounts = Array.isArray(entry?.lotCounts) ? entry.lotCounts : [];

    if (!Number.isFinite(itemId) || lotCounts.length === 0) {
      results.push({ itemId, ok: false, error: '입력값이 올바르지 않습니다.' });
      continue;
    }

    const cleanedLotCounts: { lotId: number; count: number }[] = [];
    let invalid = false;
    for (const lc of lotCounts) {
      const lotId = Number(lc?.lotId);
      const count = Number(lc?.count);
      if (!Number.isFinite(lotId) || !Number.isFinite(count) || count < 0) {
        invalid = true;
        break;
      }
      cleanedLotCounts.push({ lotId, count });
    }
    if (invalid) {
      results.push({ itemId, ok: false, error: '입력값이 올바르지 않습니다.' });
      continue;
    }

    const item = await db.item.findUnique({ where: { id: itemId } });
    if (!item) {
      results.push({ itemId, ok: false, error: '품목을 찾을 수 없습니다.' });
      continue;
    }

    const record = await recordLotCounts(itemId, yearMonth, cleanedLotCounts, staff.id);
    results.push({ itemId, ok: true, record });
  }

  return NextResponse.json({ ok: true, results, submittedByName: staff.name });
}
