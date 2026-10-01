import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getCurrentStaff } from '@/lib/auth';
import { previousYearMonth, nextYearMonth } from '@/lib/inventory';
import NavBar from '../NavBar';
import PeriodFilter from '../PeriodFilter';
import HbvSheet, { type HbvGroup, type HbvRow } from './HbvSheet';

type SearchParams = { year?: string; month?: string };

// One printed page per storage group; item order on the sheet follows this list.
const GROUPS: { key: string; title: string; storage: string; codes: string[] }[] = [
  {
    key: 'cold',
    title: 'HBV 시약/소모품 관리',
    storage: '냉장보관 : 2~8℃',
    codes: ['MR0902', 'MR0903', 'MR0904', 'MR0910', 'MR1497', 'MR1498'],
  },
  {
    key: 'room',
    title: 'HBV 시약/소모품 관리',
    storage: '실온보관',
    codes: ['MR0905', 'TC0719', 'TC0386', 'TC0387', 'TC0388', 'TC0105'],
  },
];

// Fractional counts are an already-opened unit, so only whole (unopened) units go on the sheet.
function unopened(count: number) {
  return Math.floor(count + 1e-9);
}

export default async function HbvPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login');

  const allCodes = GROUPS.flatMap((g) => g.codes);
  const items = (await db.item.findMany({ orderBy: { code: 'asc' } })).filter((i) => allCodes.includes(i.code));
  const itemByCode = new Map(items.map((i) => [i.code, i]));
  const itemIds = items.map((i) => i.id);

  const sp = await searchParams;
  const now = new Date();
  let year = Number(sp.year);
  let month = Number(sp.month);
  if (!year || !month) {
    // The 실사 for a month is usually finished at the start of the next month, so when this
    // month has no counts yet, default to last month's.
    const thisYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonthRecords = await db.monthlyRecord.findMany({ where: { yearMonth: thisYm, itemId: { in: itemIds } } });
    const ym = thisMonthRecords.some((r) => r.actualCount != null) ? thisYm : previousYearMonth(thisYm);
    year = Number(ym.slice(0, 4));
    month = Number(ym.slice(5, 7));
  }
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

  const [records, lots, nextOrders] = await Promise.all([
    db.monthlyRecord.findMany({ where: { yearMonth, itemId: { in: itemIds } } }),
    db.lot.findMany({ where: { yearMonth } }),
    db.purchaseOrder.findMany({ where: { targetYearMonth: nextYearMonth(yearMonth), itemId: { in: itemIds } } }),
  ]);
  // Items with a 다음달 발주 on the dashboard get an extra blank row to hand-write the incoming LOT.
  const orderedItemIds = new Set(nextOrders.filter((o) => o.orderedQty > 0).map((o) => o.itemId));
  const recordByItem = new Map(records.map((r) => [r.itemId, r]));
  const relevantLots = lots.filter((l) => itemIds.includes(l.itemId));
  const lotCounts = await db.lotCount.findMany({ where: { lotId: { in: relevantLots.map((l) => l.id) }, yearMonth } });
  const countByLotId = new Map(lotCounts.map((lc) => [lc.lotId, lc.count]));

  const groups: HbvGroup[] = GROUPS.map((g) => {
    const rows: HbvRow[] = [];
    g.codes.forEach((code, idx) => {
      const item = itemByCode.get(code);
      if (!item) return;
      const base = { no: idx + 1, itemId: item.id, code: item.code, name: item.name, blank: false };
      const itemRows: HbvRow[] = [];
      const itemLots = relevantLots.filter((l) => l.itemId === item.id);
      if (itemLots.length > 0) {
        for (const lot of itemLots) {
          const count = countByLotId.get(lot.id);
          if (count == null) continue;
          const qty = unopened(count);
          if (qty <= 0) continue;
          itemRows.push({ ...base, lotNumber: lot.lotNumber, qty });
        }
      } else {
        const actual = recordByItem.get(item.id)?.actualCount;
        if (actual != null && unopened(actual) > 0) {
          itemRows.push({ ...base, lotNumber: '', qty: unopened(actual) });
        }
      }
      if (orderedItemIds.has(item.id)) {
        itemRows.push({ ...base, lotNumber: '', qty: null, blank: true });
      }
      // Keep every item on the sheet even when nothing unopened is left.
      if (itemRows.length === 0) {
        itemRows.push({ ...base, lotNumber: '', qty: 0 });
      }
      rows.push(...itemRows);
    });
    return { key: g.key, title: g.title, storage: g.storage, rows };
  });

  return (
    <>
      <NavBar isMaster={staff.role === 'MASTER'} />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6 print:max-w-none print:p-0">
        <header className="print:hidden">
          <h1 className="text-lg font-semibold text-slate-900">HBV 관리</h1>
          <p className="text-sm text-slate-500">
            {yearMonth} 재고 실사 기준 · 개봉된 소수점 수량은 제외하고 미개봉 수량만 표시합니다.
          </p>
        </header>

        <PeriodFilter basePath="/hbv" year={year} month={month} />

        <HbvSheet yearMonth={yearMonth} groups={groups} />
      </div>
    </>
  );
}
