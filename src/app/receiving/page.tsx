import { redirect } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { getCurrentStaff } from '@/lib/auth';
import LogoutButton from '../LogoutButton';
import PeriodFilter from '../PeriodFilter';
import ReceivingTable from './ReceivingTable';

type SearchParams = { year?: string; month?: string };

export default async function ReceivingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login');

  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.year) || now.getFullYear();
  const month = Number(sp.month) || now.getMonth() + 1;
  const targetYearMonth = `${year}-${String(month).padStart(2, '0')}`;

  const allStaff = await db.staff.findMany({ orderBy: { id: 'asc' } });
  const staffNameById = new Map(allStaff.map((s) => [s.id, s.name]));
  const allSuppliers = await db.supplier.findMany({ orderBy: { name: 'asc' } });
  const supplierById = new Map(allSuppliers.map((s) => [s.id, s]));
  const allItems = await db.item.findMany();
  const itemById = new Map(allItems.map((i) => [i.id, i]));

  const orders = await db.purchaseOrder.findMany({ where: { targetYearMonth } });
  const orderIds = orders.map((o) => o.id);
  const allReceipts = await db.receipt.findMany({ where: { purchaseOrderId: { in: orderIds } } });
  const receiptsByOrder = new Map<number, typeof allReceipts>();
  for (const r of allReceipts) {
    const list = receiptsByOrder.get(r.purchaseOrderId) ?? [];
    list.push(r);
    receiptsByOrder.set(r.purchaseOrderId, list);
  }

  const rows = orders
    .map((order) => {
      const item = itemById.get(order.itemId);
      if (!item) return null;
      const receipts = receiptsByOrder.get(order.id) ?? [];
      const totalReceived = receipts.reduce((sum, r) => sum + r.receivedQty, 0);
      const remainingQty = order.orderedQty - totalReceived;
      const status: 'none' | 'partial' | 'complete' | 'excess' =
        totalReceived > order.orderedQty
          ? 'excess'
          : totalReceived <= 0
            ? 'none'
            : totalReceived < order.orderedQty
              ? 'partial'
              : 'complete';

      const supplier = item.supplierId ? (supplierById.get(item.supplierId) ?? null) : null;
      const lastReceivedDate = receipts.length > 0 ? receipts[receipts.length - 1].receivedDate : null;

      return {
        purchaseOrderId: order.id,
        itemId: item.id,
        code: item.code,
        name: item.name,
        spec: item.spec,
        manufacturer: item.manufacturer,
        assigneeName: item.assigneeId ? (staffNameById.get(item.assigneeId) ?? item.assigneeId) : '미지정',
        supplierId: item.supplierId,
        supplierName: supplier?.name ?? null,
        supplierColor: supplier?.color ?? null,
        lastReceivedDate,
        orderedQty: order.orderedQty,
        orderedAt: order.orderedAt,
        orderedByName: staffNameById.get(order.orderedBy) ?? order.orderedBy,
        totalReceived,
        remainingQty,
        status,
        receipts: receipts.map((r) => ({
          id: r.id,
          receivedQty: r.receivedQty,
          receivedDate: r.receivedDate,
          hasPackingSlip: r.hasPackingSlip,
          recordedByName: staffNameById.get(r.recordedBy) ?? r.recordedBy,
          note: r.note,
        })),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.code.localeCompare(b.code));

  const total = rows.length;
  const completeCount = rows.filter((r) => r.status === 'complete').length;
  const partialCount = rows.filter((r) => r.status === 'partial').length;
  const noneCount = rows.filter((r) => r.status === 'none').length;
  const excessCount = rows.filter((r) => r.status === 'excess').length;
  const allDone = total > 0 && completeCount === total;

  const summary =
    total > 0 ? (
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
          allDone ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
        }`}
      >
        {allDone
          ? `전체 ${total}개중 ${total}개 입고완료`
          : `${total}개중 ${completeCount}개 입고완료` +
            (partialCount > 0 ? `, ${partialCount}개 부분입고` : '') +
            (noneCount > 0 ? `, ${noneCount}개 미입고` : '') +
            (excessCount > 0 ? `, ${excessCount}개 초과입고` : '')}
      </span>
    ) : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">입고 관리</h1>
          <p className="text-sm text-slate-500">
            {targetYearMonth} 발주 {rows.length}건 · 담당자별 발주량을 모아 입고 현황을 확인합니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            대시보드로
          </Link>
          <LogoutButton />
        </div>
      </header>

      <PeriodFilter basePath="/receiving" year={year} month={month} summary={summary} />

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {targetYearMonth}에 등록된 발주가 없습니다. 대시보드에서 재고 파악 시 다음달 발주 수량을
          입력하면 여기에 표시됩니다.
        </p>
      ) : (
        <ReceivingTable
          targetYearMonth={targetYearMonth}
          initialRows={rows}
          suppliers={allSuppliers.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
        />
      )}
    </div>
  );
}
