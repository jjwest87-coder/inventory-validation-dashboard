'use client';

import { useState } from 'react';

type StaffRow = { id: string; name: string; role: string; active: boolean };
type SupplierRow = { id: number; name: string; color: string | null; contactName: string | null; contactPhone: string | null };
type ItemRow = {
  id: number;
  code: string;
  name: string;
  spec: string | null;
  type: string | null;
  manufacturer: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  supplierId: number | null;
  supplierName: string | null;
  orderMultiple: number | null;
  note: string | null;
  active: boolean;
};

const DEFAULT_COLOR = '#3b82f6';

export default function AdminPanel({
  currentStaffId,
  initialStaff,
  initialSuppliers,
  initialItems,
}: {
  currentStaffId: string;
  initialStaff: StaffRow[];
  initialSuppliers: SupplierRow[];
  initialItems: ItemRow[];
}) {
  const [staffList, setStaffList] = useState(initialStaff);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [items, setItems] = useState(initialItems);
  const [showInactive, setShowInactive] = useState(false);

  const [newStaffId, setNewStaffId] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'STAFF' | 'MASTER'>('STAFF');
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffSaving, setStaffSaving] = useState(false);
  const [roleError, setRoleError] = useState<Record<string, string>>({});

  const [newSupplier, setNewSupplier] = useState({ name: '', color: DEFAULT_COLOR, contactName: '', contactPhone: '' });
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [supplierSaving, setSupplierSaving] = useState(false);

  const [newItem, setNewItem] = useState({
    code: '',
    name: '',
    spec: '',
    type: '소모품',
    manufacturer: '',
    assigneeId: '',
    supplierId: '',
    orderMultiple: '',
    note: '',
  });
  const [itemError, setItemError] = useState<string | null>(null);
  const [itemSaving, setItemSaving] = useState(false);
  const [itemActionError, setItemActionError] = useState<Record<number, string>>({});

  const today = new Date();
  const [lotYear, setLotYear] = useState(today.getFullYear());
  const [lotMonth, setLotMonth] = useState(today.getMonth() + 1);
  const [lotText, setLotText] = useState('');
  const [lotSaving, setLotSaving] = useState(false);
  const [lotError, setLotError] = useState<string | null>(null);
  const [lotResult, setLotResult] = useState<{
    yearMonth: string;
    results: { code: string; added: string[]; removed: string[]; unchanged: string[] }[];
    unmatchedCodes: string[];
  } | null>(null);

  async function addStaff(e: React.FormEvent) {
    e.preventDefault();
    setStaffError(null);
    setStaffSaving(true);
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newStaffId.trim(), name: newStaffName.trim(), role: newStaffRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStaffError(data.error ?? '추가에 실패했습니다.');
        return;
      }
      setStaffList((s) => [...s, { id: data.staff.id, name: data.staff.name, role: data.staff.role, active: true }]);
      setNewStaffId('');
      setNewStaffName('');
      setNewStaffRole('STAFF');
    } finally {
      setStaffSaving(false);
    }
  }

  async function changeStaffRole(id: string, role: 'STAFF' | 'MASTER') {
    setRoleError((e) => ({ ...e, [id]: '' }));
    const prev = staffList.find((s) => s.id === id)?.role;
    setStaffList((s) => s.map((st) => (st.id === id ? { ...st, role } : st)));
    const res = await fetch('/api/admin/staff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, role }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setStaffList((s) => s.map((st) => (st.id === id ? { ...st, role: prev ?? st.role } : st)));
      setRoleError((e) => ({ ...e, [id]: data?.error ?? '변경에 실패했습니다.' }));
    }
  }

  async function addSupplier(e: React.FormEvent) {
    e.preventDefault();
    setSupplierError(null);
    setSupplierSaving(true);
    try {
      const res = await fetch('/api/admin/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSupplier.name.trim(),
          color: newSupplier.color,
          contactName: newSupplier.contactName.trim() || null,
          contactPhone: newSupplier.contactPhone.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSupplierError(data.error ?? '추가에 실패했습니다.');
        return;
      }
      setSuppliers((s) => [...s, data.supplier].sort((a, b) => a.name.localeCompare(b.name)));
      setNewSupplier({ name: '', color: DEFAULT_COLOR, contactName: '', contactPhone: '' });
    } finally {
      setSupplierSaving(false);
    }
  }

  async function updateSupplierField(supplierId: number, field: 'color' | 'contactName' | 'contactPhone', value: string) {
    setSuppliers((s) => s.map((sup) => (sup.id === supplierId ? { ...sup, [field]: value } : sup)));
    await fetch('/api/admin/suppliers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierId, [field]: value }),
    });
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    setItemError(null);
    setItemSaving(true);
    try {
      const res = await fetch('/api/admin/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newItem,
          supplierId: newItem.supplierId || null,
          orderMultiple: newItem.orderMultiple || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setItemError(data.error ?? '추가에 실패했습니다.');
        return;
      }
      const assignee = staffList.find((s) => s.id === data.item.assigneeId);
      const supplier = suppliers.find((s) => s.id === data.item.supplierId);
      setItems((it) => [
        ...it,
        {
          id: data.item.id,
          code: data.item.code,
          name: data.item.name,
          spec: data.item.spec,
          type: data.item.type,
          manufacturer: data.item.manufacturer,
          assigneeId: data.item.assigneeId,
          assigneeName: assignee?.name ?? null,
          supplierId: data.item.supplierId,
          supplierName: supplier?.name ?? null,
          orderMultiple: data.item.orderMultiple,
          note: data.item.note,
          active: true,
        },
      ]);
      setNewItem({
        code: '',
        name: '',
        spec: '',
        type: '소모품',
        manufacturer: '',
        assigneeId: '',
        supplierId: '',
        orderMultiple: '',
        note: '',
      });
    } finally {
      setItemSaving(false);
    }
  }

  async function reassignStaff(itemId: number, assigneeId: string) {
    const res = await fetch('/api/admin/items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, assigneeId: assigneeId || null }),
    });
    if (!res.ok) return;
    const assignee = staffList.find((s) => s.id === assigneeId);
    setItems((it) =>
      it.map((i) => (i.id === itemId ? { ...i, assigneeId: assigneeId || null, assigneeName: assignee?.name ?? null } : i)),
    );
  }

  async function reassignSupplier(itemId: number, supplierId: string) {
    const res = await fetch('/api/admin/items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, supplierId: supplierId || null }),
    });
    if (!res.ok) return;
    const supplier = suppliers.find((s) => s.id === Number(supplierId));
    setItems((it) =>
      it.map((i) =>
        i.id === itemId
          ? { ...i, supplierId: supplierId ? Number(supplierId) : null, supplierName: supplier?.name ?? null }
          : i,
      ),
    );
  }

  async function updateItemOrderMultiple(itemId: number, value: string) {
    const orderMultiple = value.trim() === '' ? null : Number(value);
    const res = await fetch('/api/admin/items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, orderMultiple }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setItems((it) => it.map((i) => (i.id === itemId ? { ...i, orderMultiple: data.item.orderMultiple } : i)));
  }

  async function updateItemNote(itemId: number, value: string) {
    const note = value.trim() === '' ? null : value.trim();
    const res = await fetch('/api/admin/items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, note }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setItems((it) => it.map((i) => (i.id === itemId ? { ...i, note: data.item.note } : i)));
  }

  async function toggleItemActive(itemId: number, active: boolean) {
    const res = await fetch('/api/admin/items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, active }),
    });
    if (!res.ok) return;
    setItems((it) => it.map((i) => (i.id === itemId ? { ...i, active } : i)));
  }

  async function deleteItem(itemId: number, code: string) {
    if (!window.confirm(`${code} 품목을 완전히 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    setItemActionError((e) => ({ ...e, [itemId]: '' }));
    const res = await fetch('/api/admin/items', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setItemActionError((e) => ({ ...e, [itemId]: data.error ?? '삭제에 실패했습니다.' }));
      return;
    }
    setItems((it) => it.filter((i) => i.id !== itemId));
  }

  async function submitLots(e: React.FormEvent) {
    e.preventDefault();
    setLotError(null);
    setLotResult(null);
    setLotSaving(true);
    try {
      const yearMonth = `${lotYear}-${String(lotMonth).padStart(2, '0')}`;
      const res = await fetch('/api/admin/lots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: lotText, yearMonth }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLotError(data.error ?? '등록에 실패했습니다.');
        return;
      }
      setLotResult({ yearMonth, results: data.results, unmatchedCodes: data.unmatchedCodes });
      setLotText('');
    } finally {
      setLotSaving(false);
    }
  }

  const visibleItems = showInactive ? items : items.filter((i) => i.active);

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">담당자 관리</h2>

        <form onSubmit={addStaff} className="mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500">사번</label>
            <input
              value={newStaffId}
              onChange={(e) => setNewStaffId(e.target.value)}
              className="w-32 rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="L20000"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">이름</label>
            <input
              value={newStaffName}
              onChange={(e) => setNewStaffName(e.target.value)}
              className="w-32 rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="홍길동"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">권한</label>
            <select
              value={newStaffRole}
              onChange={(e) => setNewStaffRole(e.target.value as 'STAFF' | 'MASTER')}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="STAFF">담당자</option>
              <option value="MASTER">마스터</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={staffSaving}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            담당자 추가 (초기 비밀번호 1111)
          </button>
          {staffError && <p className="text-sm text-red-600">{staffError}</p>}
        </form>

        <table className="w-full text-left text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1 font-medium">사번</th>
              <th className="py-1 font-medium">이름</th>
              <th className="py-1 font-medium">권한</th>
            </tr>
          </thead>
          <tbody>
            {staffList.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="py-1.5 font-mono text-xs">{s.id}</td>
                <td className="py-1.5">{s.name}</td>
                <td className="py-1.5">
                  {s.id === currentStaffId ? (
                    <span className="text-slate-500">{s.role === 'MASTER' ? '마스터' : '담당자'} (본인)</span>
                  ) : (
                    <select
                      value={s.role}
                      onChange={(e) => changeStaffRole(s.id, e.target.value as 'STAFF' | 'MASTER')}
                      className="rounded border border-slate-300 px-2 py-1 text-sm"
                    >
                      <option value="STAFF">담당자</option>
                      <option value="MASTER">마스터</option>
                    </select>
                  )}
                  {roleError[s.id] && <p className="mt-1 text-xs text-red-600">{roleError[s.id]}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">입고처 관리</h2>
        <p className="mb-3 text-xs text-slate-500">
          품목에 입고처를 지정해두면, 입고 관리 화면에서 같은 입고처 품목을 색상으로 구분하고 한 번에
          선택해 입고일을 일괄 적용할 수 있습니다. 담당자 연락처를 등록해두면 배송 확인 시 참고할 수
          있습니다.
        </p>

        <form onSubmit={addSupplier} className="mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500">색상</label>
            <input
              type="color"
              value={newSupplier.color}
              onChange={(e) => setNewSupplier((v) => ({ ...v, color: e.target.value }))}
              className="h-8 w-12 rounded border border-slate-300"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">입고처 이름</label>
            <input
              value={newSupplier.name}
              onChange={(e) => setNewSupplier((v) => ({ ...v, name: e.target.value }))}
              className="w-40 rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="예: 한양코리아"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">담당자</label>
            <input
              value={newSupplier.contactName}
              onChange={(e) => setNewSupplier((v) => ({ ...v, contactName: e.target.value }))}
              className="w-28 rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="담당자명"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">전화번호</label>
            <input
              value={newSupplier.contactPhone}
              onChange={(e) => setNewSupplier((v) => ({ ...v, contactPhone: e.target.value }))}
              className="w-36 rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="010-0000-0000"
            />
          </div>
          <button
            type="submit"
            disabled={supplierSaving}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            입고처 추가
          </button>
          {supplierError && <p className="text-sm text-red-600">{supplierError}</p>}
        </form>

        {suppliers.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="w-16 py-1 font-medium">색상</th>
                <th className="py-1 font-medium">이름</th>
                <th className="py-1 font-medium">담당자</th>
                <th className="py-1 font-medium">전화번호</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="py-1.5">
                    <input
                      type="color"
                      value={s.color ?? DEFAULT_COLOR}
                      onChange={(e) => updateSupplierField(s.id, 'color', e.target.value)}
                      className="h-6 w-10 rounded border border-slate-300"
                    />
                  </td>
                  <td className="py-1.5">{s.name}</td>
                  <td className="py-1.5">
                    <input
                      defaultValue={s.contactName ?? ''}
                      onBlur={(e) => updateSupplierField(s.id, 'contactName', e.target.value)}
                      className="w-28 rounded border border-slate-300 px-2 py-1 text-sm"
                      placeholder="담당자명"
                    />
                  </td>
                  <td className="py-1.5">
                    <input
                      defaultValue={s.contactPhone ?? ''}
                      onBlur={(e) => updateSupplierField(s.id, 'contactPhone', e.target.value)}
                      className="w-36 rounded border border-slate-300 px-2 py-1 text-sm"
                      placeholder="010-0000-0000"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">품목 관리</h2>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            비활성 품목 포함
          </label>
        </div>

        <form onSubmit={addItem} className="mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500">품목코드</label>
            <input
              value={newItem.code}
              onChange={(e) => setNewItem((v) => ({ ...v, code: e.target.value }))}
              className="w-28 rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">품목명</label>
            <input
              value={newItem.name}
              onChange={(e) => setNewItem((v) => ({ ...v, name: e.target.value }))}
              className="w-40 rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">규격</label>
            <input
              value={newItem.spec}
              onChange={(e) => setNewItem((v) => ({ ...v, spec: e.target.value }))}
              className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">제조사</label>
            <input
              value={newItem.manufacturer}
              onChange={(e) => setNewItem((v) => ({ ...v, manufacturer: e.target.value }))}
              className="w-28 rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">담당자</label>
            <select
              value={newItem.assigneeId}
              onChange={(e) => setNewItem((v) => ({ ...v, assigneeId: e.target.value }))}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="">미지정</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">입고처</label>
            <select
              value={newItem.supplierId}
              onChange={(e) => setNewItem((v) => ({ ...v, supplierId: e.target.value }))}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="">미지정</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">발주 단위(배수)</label>
            <input
              type="number"
              min={1}
              value={newItem.orderMultiple}
              onChange={(e) => setNewItem((v) => ({ ...v, orderMultiple: e.target.value }))}
              className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="없음"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">비고</label>
            <input
              value={newItem.note}
              onChange={(e) => setNewItem((v) => ({ ...v, note: e.target.value }))}
              className="w-40 rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="특이사항"
            />
          </div>
          <button
            type="submit"
            disabled={itemSaving}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            품목 추가
          </button>
          {itemError && <p className="text-sm text-red-600">{itemError}</p>}
        </form>
        <p className="mb-4 -mt-2 text-xs text-slate-500">
          발주 단위를 지정하면, 재고 파악 화면에서 다음달 발주 수량이 그 배수가 아닐 때 입력칸이 빨간색으로
          표시되고 경고가 뜹니다 (예: 2로 지정하면 짝수만 허용). 비워두면 검증하지 않습니다.
        </p>

        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white text-slate-500">
              <tr>
                <th className="py-1 font-medium">품목코드</th>
                <th className="py-1 font-medium">품목명</th>
                <th className="py-1 font-medium">제조사</th>
                <th className="py-1 font-medium">담당자</th>
                <th className="py-1 font-medium">입고처</th>
                <th className="py-1 font-medium">발주 단위</th>
                <th className="py-1 font-medium">비고</th>
                <th className="py-1 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((i) => (
                <tr key={i.id} className={`border-t border-slate-100 ${!i.active ? 'opacity-50' : ''}`}>
                  <td className="py-1.5 font-mono text-xs">
                    {i.code}
                    {!i.active && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500">비활성</span>}
                  </td>
                  <td className="py-1.5">{i.name}</td>
                  <td className="py-1.5 text-slate-500">{i.manufacturer ?? '-'}</td>
                  <td className="py-1.5">
                    <select
                      value={i.assigneeId ?? ''}
                      onChange={(e) => reassignStaff(i.id, e.target.value)}
                      className="rounded border border-slate-300 px-2 py-1 text-sm"
                    >
                      <option value="">미지정</option>
                      {staffList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.id})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5">
                    <select
                      value={i.supplierId ?? ''}
                      onChange={(e) => reassignSupplier(i.id, e.target.value)}
                      className="rounded border border-slate-300 px-2 py-1 text-sm"
                    >
                      <option value="">미지정</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5">
                    <input
                      type="number"
                      min={1}
                      defaultValue={i.orderMultiple ?? ''}
                      onBlur={(e) => updateItemOrderMultiple(i.id, e.target.value)}
                      className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
                      placeholder="없음"
                    />
                  </td>
                  <td className="py-1.5">
                    <input
                      defaultValue={i.note ?? ''}
                      onBlur={(e) => updateItemNote(i.id, e.target.value)}
                      className="w-40 rounded border border-slate-300 px-2 py-1 text-sm"
                      placeholder="특이사항"
                    />
                  </td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => toggleItemActive(i.id, !i.active)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                      >
                        {i.active ? '비활성화' : '복원'}
                      </button>
                      <button
                        onClick={() => deleteItem(i.id, i.code)}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        삭제
                      </button>
                    </div>
                    {itemActionError[i.id] && <p className="mt-1 text-xs text-red-600">{itemActionError[i.id]}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">LOT 목록 관리</h2>
        <p className="mb-3 text-xs text-slate-500">
          엑셀에서 <strong>품목코드, LOT번호</strong> 두 열을 그대로 복사해 아래에 붙여넣고, 이 LOT
          목록이 적용될 <strong>연도·월을 지정</strong>한 뒤 &quot;일괄 등록&quot;을 누르세요. LOT은
          매달 구성이 바뀌므로, 월마다 그 달의 목록을 따로 등록합니다 (다른 달의 목록에는 영향을 주지
          않습니다). 재고 파악 대시보드에서 해당 월을 조회하면 그 달에 등록된 LOT만 보이고, 그 합이
          자동으로 이번달 실사 수량이 됩니다.
        </p>

        <form onSubmit={submitLots} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">적용할 월</span>
            <select
              value={lotYear}
              onChange={(e) => setLotYear(Number(e.target.value))}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            >
              {Array.from({ length: 4 }, (_, i) => today.getFullYear() - 1 + i).map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
            <select
              value={lotMonth}
              onChange={(e) => setLotMonth(Number(e.target.value))}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={lotText}
            onChange={(e) => setLotText(e.target.value)}
            rows={6}
            placeholder={'MD0002\tMM2512E0101-1\nMD0002\tMM2609E0101-1\nMD0003\tMM2404EP0101-1'}
            className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-xs"
          />
          <div>
            <button
              type="submit"
              disabled={lotSaving || !lotText.trim()}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {lotSaving ? '등록 중...' : '일괄 등록'}
            </button>
          </div>
          {lotError && <p className="text-sm text-red-600">{lotError}</p>}
        </form>

        {lotResult && (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p className="mb-1 font-medium text-slate-700">
              {lotResult.yearMonth} 기준 {lotResult.results.length}개 품목 갱신됨
            </p>
            <ul className="space-y-0.5">
              {lotResult.results.map((r) => (
                <li key={r.code}>
                  {r.code}: 유지 {r.unchanged.length}
                  {r.added.length > 0 && `, 추가 ${r.added.length}(${r.added.join(', ')})`}
                  {r.removed.length > 0 && `, 제외 ${r.removed.length}(${r.removed.join(', ')})`}
                </li>
              ))}
            </ul>
            {lotResult.unmatchedCodes.length > 0 && (
              <p className="mt-2 text-red-600">
                품목코드를 찾지 못함: {lotResult.unmatchedCodes.join(', ')}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
