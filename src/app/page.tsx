import { redirect } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { getCurrentStaff } from '@/lib/auth';
import { previousYearMonth, nextYearMonth, getHistoryMap, averageUsage } from '@/lib/inventory';
import InventoryTable from './InventoryTable';
import LogoutButton from './LogoutButton';
import PeriodFilter from './PeriodFilter';

type SearchParams = { year?: string; month?: string; assignee?: string };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login');

  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.year) || now.getFullYear();
  const month = Number(sp.month) || now.getMonth() + 1;
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
  const prevYearMonth = previousYearMonth(yearMonth);
  const nextYm = nextYearMonth(yearMonth);
  const assigneeFilter = sp.assignee ?? 'all';

  const allStaff = await db.staff.findMany({ orderBy: { id: 'asc' } });
  const staffNameById = new Map(allStaff.map((s) => [s.id, s.name]));

  const items = await db.item.findMany({
    where: assigneeFilter === 'all' ? { active: true } : { active: true, assigneeId: assigneeFilter },
    orderBy: { code: 'asc' },
  });
  const itemIds = items.map((i) => i.id);

  const [currentRecords, prevRecords] = await Promise.all([
    db.monthlyRecord.findMany({ where: { yearMonth, itemId: { in: itemIds } } }),
    db.monthlyRecord.findMany({ where: { yearMonth: prevYearMonth, itemId: { in: itemIds } } }),
  ]);
  const currentMap = new Map(currentRecords.map((r) => [r.itemId, r]));
  const prevMap = new Map(prevRecords.map((r) => [r.itemId, r]));

  const nextOrders = await db.purchaseOrder.findMany({ where: { targetYearMonth: nextYm, itemId: { in: itemIds } } });
  const nextOrderMap = new Map(nextOrders.map((o) => [o.itemId, o]));

  // This month's incoming quantity now comes from what was logged on the 입고 관리
  // (receiving) screen, not typed by hand here.
  const currentOrders = await db.purchaseOrder.findMany({ where: { targetYearMonth: yearMonth, itemId: { in: itemIds } } });
  const currentOrderByItem = new Map(currentOrders.map((o) => [o.itemId, o]));
  const currentReceipts = await db.receipt.findMany({
    where: { purchaseOrderId: { in: currentOrders.map((o) => o.id) } },
  });
  const receivedByOrderId = new Map<number, number>();
  for (const rcpt of currentReceipts) {
    receivedByOrderId.set(rcpt.purchaseOrderId, (receivedByOrderId.get(rcpt.purchaseOrderId) ?? 0) + rcpt.receivedQty);
  }
  function liveIncomingQty(itemId: number) {
    const order = currentOrderByItem.get(itemId);
    if (!order) return 0;
    return receivedByOrderId.get(order.id) ?? 0;
  }

  const [actualCountHistory, orderHistory] = await Promise.all([
    getHistoryMap('monthly_record'),
    getHistoryMap('purchase_order'),
  ]);

  // LOT-tracked items get one input per LOT on the dashboard, summing to the item's
  // actual count — the LOT list is month-specific, maintained in the admin screen (bulk paste).
  const allLots = await db.lot.findMany({ where: { yearMonth } });
  const lotsByItem = new Map<number, typeof allLots>();
  for (const lot of allLots) {
    if (!itemIds.includes(lot.itemId)) continue;
    const list = lotsByItem.get(lot.itemId) ?? [];
    list.push(lot);
    lotsByItem.set(lot.itemId, list);
  }
  const relevantLotIds = [...lotsByItem.values()].flat().map((l) => l.id);
  const lotCounts = await db.lotCount.findMany({ where: { lotId: { in: relevantLotIds }, yearMonth } });
  const lotCountByLotId = new Map(lotCounts.map((lc) => [lc.lotId, lc.count]));

  // Shown as a suggested order-quantity reference next to the 다음달 발주 input — based on the same
  // recent-months average usage rate used for this month's expected-stock comparison.
  const avgUsageEntries = await Promise.all(items.map((item) => averageUsage(item.id, yearMonth)));
  const avgUsageByItemId = new Map(items.map((item, i) => [item.id, avgUsageEntries[i]]));

  const rows = items.map((item) => {
    const r = currentMap.get(item.id);
    const prev = prevMap.get(item.id);
    const nextOrder = nextOrderMap.get(item.id);
    const actualHistory = (actualCountHistory.get(`${item.id}:${yearMonth}`) ?? []).map((h) => ({
      ...h,
      changedByName: staffNameById.get(h.changedBy) ?? h.changedBy,
    }));
    const nextOrderHistory = (orderHistory.get(`${item.id}:${nextYm}`) ?? []).map((h) => ({
      ...h,
      changedByName: staffNameById.get(h.changedBy) ?? h.changedBy,
    }));
    return {
      itemId: item.id,
      code: item.code,
      name: item.name,
      spec: item.spec,
      manufacturer: item.manufacturer,
      orderMultiple: item.orderMultiple,
      note: item.note,
      assigneeId: item.assigneeId,
      assigneeName: item.assigneeId ? (staffNameById.get(item.assigneeId) ?? item.assigneeId) : '미지정',
      prevActualCount: prev?.actualCount ?? null,
      incomingQty: liveIncomingQty(item.id),
      actualCount: r?.actualCount ?? null,
      expectedCount: r?.expectedCount ?? null,
      previousStock: r?.previousStock ?? null,
      variance: r?.variance ?? null,
      flagged: r?.flagged ?? false,
      isBaseline: r?.isBaseline ?? true,
      submittedAt: r?.submittedAt ?? null,
      submittedByName: r ? (staffNameById.get(r.staffId) ?? r.staffId) : null,
      nextOrderedQty: nextOrder?.orderedQty ?? null,
      twoMonthUsageEstimate: (() => {
        const avg = avgUsageByItemId.get(item.id);
        return avg == null ? null : avg * 2;
      })(),
      actualCountHistory: actualHistory,
      nextOrderHistory,
      lots: (lotsByItem.get(item.id) ?? []).map((l) => ({
        id: l.id,
        lotNumber: l.lotNumber,
        count: lotCountByLotId.get(l.id) ?? null,
      })),
    };
  });

  const assigneeLabel = assigneeFilter === 'all' ? '전체' : (staffNameById.get(assigneeFilter) ?? assigneeFilter);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">재고 파악 대시보드</h1>
          <p className="text-sm text-slate-500">
            {yearMonth} · {assigneeLabel} 담당 품목 {items.length}건
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/receiving"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            입고 관리
          </Link>
          {staff.role === 'MASTER' && (
            <Link
              href="/admin"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              관리자 화면
            </Link>
          )}
          <LogoutButton />
        </div>
      </header>

      <h1 className="hidden text-base font-semibold text-black print:block">
        {year}년 {month}월 재고실사 {assigneeLabel} 품목 {items.length}건
      </h1>

      <PeriodFilter
        year={year}
        month={month}
        assignee={assigneeFilter}
        staffOptions={allStaff.map((s) => ({ id: s.id, name: s.name }))}
      />

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          해당 조건의 품목이 없습니다.
        </p>
      ) : (
        <InventoryTable
          yearMonth={yearMonth}
          nextYearMonth={nextYm}
          initialRows={rows}
          currentStaffName={staff.name}
        />
      )}
    </div>
  );
}
