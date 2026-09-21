import { redirect } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { getCurrentStaff } from '@/lib/auth';
import AdminPanel from './AdminPanel';

export default async function AdminPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login');
  if (staff.role !== 'MASTER') redirect('/');

  const [allStaff, allItems, allSuppliers] = await Promise.all([
    db.staff.findMany({ orderBy: { id: 'asc' } }),
    // Admin view includes inactive items so they can be reactivated or removed.
    db.item.findMany({ orderBy: { code: 'asc' }, include: { assignee: true, supplier: true } }),
    db.supplier.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">관리자 화면</h1>
          <p className="text-sm text-slate-500">담당자 추가, 품목 추가/담당자·입고처 변경, 입고처 관리.</p>
        </div>
        <Link href="/" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
          대시보드로
        </Link>
      </header>

      <AdminPanel
        initialStaff={allStaff.map((s) => ({ id: s.id, name: s.name, role: s.role, active: s.active }))}
        initialSuppliers={allSuppliers.map((s) => ({
          id: s.id,
          name: s.name,
          color: s.color,
          contactName: s.contactName,
          contactPhone: s.contactPhone,
        }))}
        initialItems={allItems.map((i) => ({
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
        }))}
      />
    </div>
  );
}
