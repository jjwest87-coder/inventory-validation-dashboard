import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentStaff } from '@/lib/auth';
import { isValidYearMonth } from '@/lib/inventory';

function parseLotText(text: string): Map<string, string[]> {
  const byCode = new Map<string, string[]>();
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    let parts = line.split(/\t+/).filter(Boolean);
    if (parts.length < 2) parts = line.split(/\s{2,}/).filter(Boolean);
    if (parts.length < 2) parts = line.split(/\s+/).filter(Boolean);
    if (parts.length < 2) continue;

    const code = parts[0].trim();
    const lotNumber = parts[1].trim();
    if (!code || !lotNumber) continue;

    const list = byCode.get(code) ?? [];
    if (!list.includes(lotNumber)) list.push(lotNumber);
    byCode.set(code, list);
  }
  return byCode;
}

export async function POST(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== 'MASTER') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text : '';
  const yearMonth = body?.yearMonth;

  if (!isValidYearMonth(yearMonth)) {
    return NextResponse.json({ error: '적용할 월을 선택해주세요.' }, { status: 400 });
  }
  if (!text.trim()) {
    return NextResponse.json({ error: '붙여넣을 내용이 없습니다.' }, { status: 400 });
  }

  const byCode = parseLotText(text);
  const unmatchedCodes: string[] = [];
  const results: { code: string; added: string[]; removed: string[]; unchanged: string[] }[] = [];

  for (const [code, desiredLots] of byCode) {
    const item = await db.item.findUnique({ where: { code } });
    if (!item) {
      unmatchedCodes.push(code);
      continue;
    }

    // Only this item's lots for this specific month are touched — other months are untouched.
    const existingLots = await db.lot.findMany({ where: { itemId: item.id, yearMonth } });
    const existingByNumber = new Map(existingLots.map((l) => [l.lotNumber, l]));

    const added: string[] = [];
    const unchanged: string[] = [];

    for (const lotNumber of desiredLots) {
      const existing = existingByNumber.get(lotNumber);
      if (!existing) {
        await db.lot.create({ data: { itemId: item.id, yearMonth, lotNumber } });
        added.push(lotNumber);
      } else {
        unchanged.push(lotNumber);
      }
    }

    const desiredSet = new Set(desiredLots);
    const removed: string[] = [];
    for (const existing of existingLots) {
      if (!desiredSet.has(existing.lotNumber)) {
        await db.lot.delete({ where: { id: existing.id } });
        removed.push(existing.lotNumber);
      }
    }

    results.push({ code, added, removed, unchanged });
  }

  await db.auditLog.create({
    data: {
      actorId: staff.id,
      action: 'lots.bulk_update',
      detail: `${yearMonth} ${results.length}개 품목 LOT 목록 갱신, 미매칭 ${unmatchedCodes.length}건`,
    },
  });

  return NextResponse.json({ ok: true, results, unmatchedCodes });
}
