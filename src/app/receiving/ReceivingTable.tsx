'use client';

import { Fragment, useMemo, useState } from 'react';

type Receipt = {
  id: number;
  receivedQty: number;
  receivedDate: string;
  hasPackingSlip: boolean;
  recordedByName: string;
  note: string | null;
};

type Row = {
  purchaseOrderId: number;
  itemId: number;
  code: string;
  name: string;
  spec: string | null;
  manufacturer: string | null;
  assigneeName: string;
  supplierId: number | null;
  supplierName: string | null;
  supplierColor: string | null;
  lastReceivedDate: string | null;
  orderedQty: number;
  orderedAt: string;
  orderedByName: string;
  totalReceived: number;
  remainingQty: number;
  status: 'none' | 'partial' | 'complete' | 'excess';
  receipts: Receipt[];
};

function recomputeAggregates(row: Row): Row {
  const totalReceived = row.receipts.reduce((sum, r) => sum + r.receivedQty, 0);
  const remainingQty = row.orderedQty - totalReceived;
  const status: Row['status'] =
    totalReceived > row.orderedQty
      ? 'excess'
      : totalReceived <= 0
        ? 'none'
        : totalReceived < row.orderedQty
          ? 'partial'
          : 'complete';
  return { ...row, totalReceived, remainingQty, status };
}

function todayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function statusBadge(status: Row['status']) {
  if (status === 'excess') {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        초과입고 확인필요
      </span>
    );
  }
  if (status === 'complete') {
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">입고완료</span>;
  }
  if (status === 'partial') {
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">부분입고</span>;
  }
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">미입고</span>;
}

export default function ReceivingTable({
  targetYearMonth,
  initialRows,
  suppliers,
}: {
  targetYearMonth: string;
  initialRows: Row[];
  suppliers: { id: number; name: string; color: string | null }[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [forms, setForms] = useState<Record<number, { qty: string; date: string; slip: boolean; note: string }>>(
    Object.fromEntries(
      initialRows.map((r) => [
        r.itemId,
        { qty: '', date: r.lastReceivedDate ?? todayDateString(), slip: false, note: '' },
      ]),
    ),
  );
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | Row['status']>('all');
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null);
  const [bulkDate, setBulkDate] = useState(todayDateString());
  const [bulkSlip, setBulkSlip] = useState(true);
  const [rowError, setRowError] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editingReceiptId, setEditingReceiptId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState({ qty: '', date: '', slip: false, note: '' });
  const [historyError, setHistoryError] = useState<Record<number, string>>({});

  function toggleExpanded(itemId: number) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function startEdit(receipt: Receipt) {
    setEditingReceiptId(receipt.id);
    setEditDraft({
      qty: String(receipt.receivedQty),
      date: receipt.receivedDate,
      slip: receipt.hasPackingSlip,
      note: receipt.note ?? '',
    });
  }

  async function saveEdit(itemId: number, receiptId: number) {
    const receivedQty = Number(editDraft.qty);
    if (!editDraft.qty || Number.isNaN(receivedQty) || receivedQty <= 0) {
      setHistoryError((e) => ({ ...e, [receiptId]: '수량을 올바르게 입력하세요.' }));
      return;
    }
    const res = await fetch('/api/receipts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receiptId,
        receivedQty,
        receivedDate: editDraft.date,
        hasPackingSlip: editDraft.slip,
        note: editDraft.note,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setHistoryError((e) => ({ ...e, [receiptId]: data.error ?? '수정에 실패했습니다.' }));
      return;
    }
    setRows((rs) =>
      rs.map((r) => {
        if (r.itemId !== itemId) return r;
        const receipts = r.receipts.map((rc) => (rc.id === receiptId ? { ...rc, ...data.receipt } : rc));
        return recomputeAggregates({ ...r, receipts });
      }),
    );
    setHistoryError((e) => ({ ...e, [receiptId]: '' }));
    setEditingReceiptId(null);
  }

  async function deleteReceipt(itemId: number, receiptId: number) {
    if (!window.confirm('이 입고 기록을 삭제하시겠습니까?')) return;
    const res = await fetch('/api/receipts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiptId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setHistoryError((e) => ({ ...e, [receiptId]: data.error ?? '삭제에 실패했습니다.' }));
      return;
    }
    setRows((rs) =>
      rs.map((r) => {
        if (r.itemId !== itemId) return r;
        const receipts = r.receipts.filter((rc) => rc.id !== receiptId);
        return recomputeAggregates({ ...r, receipts });
      }),
    );
  }

  function updateForm(itemId: number, field: 'qty' | 'date' | 'slip' | 'note', value: string | boolean) {
    setForms((f) => ({ ...f, [itemId]: { ...f[itemId], [field]: value } }));
  }

  function toggleSelected(itemId: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  const visibleRows = useMemo(() => {
    let list = supplierFilter === 'all' ? rows : rows.filter((r) => String(r.supplierId) === supplierFilter);
    if (statusFilter !== 'all') list = list.filter((r) => r.status === statusFilter);
    if (sortDir) {
      list = [...list].sort((a, b) => {
        const da = forms[a.itemId]?.date ?? '';
        const db_ = forms[b.itemId]?.date ?? '';
        return sortDir === 'asc' ? da.localeCompare(db_) : db_.localeCompare(da);
      });
    }
    return list;
  }, [rows, supplierFilter, statusFilter, sortDir, forms]);

  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.itemId));

  function toggleSelectAllVisible() {
    setSelected((s) => {
      const next = new Set(s);
      if (allVisibleSelected) {
        for (const r of visibleRows) next.delete(r.itemId);
      } else {
        for (const r of visibleRows) next.add(r.itemId);
      }
      return next;
    });
  }

  function applyBulkDate() {
    setForms((f) => {
      const next = { ...f };
      for (const itemId of selected) next[itemId] = { ...next[itemId], date: bulkDate };
      return next;
    });
  }

  function applyBulkSlip() {
    setForms((f) => {
      const next = { ...f };
      for (const itemId of selected) next[itemId] = { ...next[itemId], slip: bulkSlip };
      return next;
    });
  }

  /** Fills each selected row's 입고 input with exactly its own remaining quantity (발주 - 누적입고). */
  function applyBulkFullReceive() {
    setForms((f) => {
      const next = { ...f };
      for (const itemId of selected) {
        const row = rows.find((r) => r.itemId === itemId);
        if (row && row.remainingQty > 0) {
          next[itemId] = { ...next[itemId], qty: String(row.remainingQty) };
        }
      }
      return next;
    });
  }

  async function saveAll() {
    const entries = rows
      .filter((r) => forms[r.itemId].qty !== '')
      .map((r) => ({
        itemId: r.itemId,
        receivedQty: Number(forms[r.itemId].qty),
        receivedDate: forms[r.itemId].date,
        hasPackingSlip: forms[r.itemId].slip,
        note: forms[r.itemId].note || undefined,
      }));

    if (entries.length === 0) {
      setSummary('입력된 값이 없습니다.');
      return;
    }

    setSaving(true);
    setSummary(null);
    setRowError({});
    try {
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetYearMonth, receipts: entries }),
      });
      const data = await res.json();

      if (res.status !== 200) {
        setSummary(data.error ?? '저장에 실패했습니다.');
        return;
      }

      const newErrors: Record<number, string> = {};
      let successCount = 0;
      let failCount = 0;

      for (const result of data.results) {
        if (result.ok) {
          successCount++;
          const recordedByName = data.recordedByName ?? '';
          setRows((rs) =>
            rs.map((r) => {
              if (r.itemId !== result.itemId) return r;
              const newReceipt: Receipt = {
                id: result.receipt.id,
                receivedQty: result.receipt.receivedQty,
                receivedDate: result.receipt.receivedDate,
                hasPackingSlip: result.receipt.hasPackingSlip,
                recordedByName,
                note: result.receipt.note,
              };
              return recomputeAggregates({
                ...r,
                receipts: [...r.receipts, newReceipt],
                lastReceivedDate: result.receipt.receivedDate,
              });
            }),
          );
          setForms((f) => ({
            ...f,
            // Only clear the quantity so the same amount isn't accidentally resubmitted —
            // date and packing-slip usually stay the same for the next item in the same shipment.
            [result.itemId]: { qty: '', date: f[result.itemId].date, slip: f[result.itemId].slip, note: '' },
          }));
        } else {
          failCount++;
          newErrors[result.itemId] = result.error ?? '저장 실패';
        }
      }

      setRowError(newErrors);
      setSummary(failCount > 0 ? `${successCount}건 저장, ${failCount}건 실패` : `${successCount}건 저장 완료`);
    } finally {
      setSaving(false);
    }
  }

  function toggleSort() {
    setSortDir((d) => (d === null ? 'asc' : d === 'asc' ? 'desc' : null));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 print:hidden">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">입고처</span>
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="all">전체</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id} style={s.color ? { color: s.color } : undefined}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
          <span className="text-sm text-slate-500">상태</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | Row['status'])}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="all">전체</option>
            <option value="none">미입고</option>
            <option value="partial">부분입고</option>
            <option value="complete">입고완료</option>
            <option value="excess">초과입고</option>
          </select>
        </div>

        <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
          <span className="text-sm text-slate-500">선택 {selected.size}건 입고일 일괄 적용</span>
          <input
            type="date"
            value={bulkDate}
            onChange={(e) => setBulkDate(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            onClick={applyBulkDate}
            disabled={selected.size === 0}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            적용
          </button>
        </div>

        <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
          <span className="text-sm text-slate-500">명세서 일괄 적용</span>
          <select
            value={bulkSlip ? 'yes' : 'no'}
            onChange={(e) => setBulkSlip(e.target.value === 'yes')}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="yes">체크</option>
            <option value="no">해제</option>
          </select>
          <button
            onClick={applyBulkSlip}
            disabled={selected.size === 0}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            적용
          </button>
        </div>

        <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
          <button
            onClick={applyBulkFullReceive}
            disabled={selected.size === 0}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            선택 항목 전량 입고 (발주 수량만큼 채우기)
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {summary && <span className="text-xs text-slate-500">{summary}</span>}
          <button
            onClick={saveAll}
            disabled={saving}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '전체 저장'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="w-10 px-3 py-2">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
              </th>
              <th className="px-3 py-2 font-medium">재료코드</th>
              <th className="px-3 py-2 font-medium">재료명</th>
              <th className="px-3 py-2 font-medium">담당자</th>
              <th className="px-3 py-2 font-medium">입고처</th>
              <th className="w-36 px-3 py-2 font-medium">
                <button onClick={toggleSort} className="flex items-center gap-1 hover:text-slate-700">
                  입고일 {sortDir === 'asc' ? '▲' : sortDir === 'desc' ? '▼' : ''}
                </button>
              </th>
              <th className="w-20 px-3 py-2 font-medium">발주</th>
              <th className="w-24 px-3 py-2 font-medium">입고</th>
              <th className="w-20 px-3 py-2 font-medium">미입고</th>
              <th className="w-16 px-3 py-2 font-medium">명세서</th>
              <th className="px-3 py-2 font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const form = forms[row.itemId];
              const isSelected = selected.has(row.itemId);
              const draftQty = Number(form.qty || 0);
              const previewRemaining = row.orderedQty - row.totalReceived - draftQty;
              return (
                <Fragment key={row.itemId}>
                <tr
                  className={`border-t border-slate-100 align-top ${isSelected ? 'bg-sky-50' : ''}`}
                  style={
                    !isSelected && row.supplierColor ? { backgroundColor: `${row.supplierColor}14` } : undefined
                  }
                >
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelected(row.itemId)} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{row.code}</td>
                  <td className="px-3 py-2 text-slate-800">
                    {row.name}
                    {row.spec && <span className="ml-1 text-xs text-slate-400">({row.spec})</span>}
                    {row.manufacturer && <div className="text-xs text-slate-400">{row.manufacturer}</div>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.assigneeName}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {row.supplierName ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: row.supplierColor ?? '#94a3b8' }}
                        />
                        {row.supplierName}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      value={form.date}
                      onChange={(e) => updateForm(row.itemId, 'date', e.target.value)}
                      className="w-32 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.orderedQty}</td>
                  <td className="px-3 py-2">
                    <div className="text-sm font-medium text-slate-700">{row.totalReceived}</div>
                    <input
                      type="number"
                      min={0}
                      value={form.qty}
                      onChange={(e) => updateForm(row.itemId, 'qty', e.target.value)}
                      placeholder="추가 입고"
                      className="mt-1 w-20 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                    {rowError[row.itemId] && <p className="mt-1 text-xs text-red-600">{rowError[row.itemId]}</p>}
                    {row.receipts.length > 0 && (
                      <button
                        onClick={() => toggleExpanded(row.itemId)}
                        className="mt-1 block text-[11px] text-slate-400 underline hover:text-slate-600"
                      >
                        입고 이력 {row.receipts.length}건 {expanded.has(row.itemId) ? '숨기기' : '보기'}
                      </button>
                    )}
                  </td>
                  <td className={`px-3 py-2 ${previewRemaining < 0 ? 'font-medium text-red-600' : 'text-slate-600'}`}>
                    {previewRemaining}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={form.slip}
                      onChange={(e) => updateForm(row.itemId, 'slip', e.target.checked)}
                    />
                  </td>
                  <td className="px-3 py-2">{statusBadge(row.status)}</td>
                </tr>
                {expanded.has(row.itemId) && (
                <tr className="border-t border-slate-100 bg-slate-50/60">
                  <td />
                  <td colSpan={10} className="px-3 py-2">
                    <table className="w-full text-left text-xs">
                      <thead className="text-slate-400">
                        <tr>
                          <th className="py-1 font-medium">입고일</th>
                          <th className="py-1 font-medium">수량</th>
                          <th className="py-1 font-medium">명세서</th>
                          <th className="py-1 font-medium">입력자</th>
                          <th className="py-1 font-medium">비고</th>
                          <th className="py-1 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.receipts.map((r) =>
                          editingReceiptId === r.id ? (
                            <tr key={r.id} className="border-t border-slate-100">
                              <td className="py-1 pr-2">
                                <input
                                  type="date"
                                  value={editDraft.date}
                                  onChange={(e) => setEditDraft((d) => ({ ...d, date: e.target.value }))}
                                  className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                                />
                              </td>
                              <td className="py-1 pr-2">
                                <input
                                  type="number"
                                  min={0}
                                  value={editDraft.qty}
                                  onChange={(e) => setEditDraft((d) => ({ ...d, qty: e.target.value }))}
                                  className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                                />
                              </td>
                              <td className="py-1 pr-2">
                                <input
                                  type="checkbox"
                                  checked={editDraft.slip}
                                  onChange={(e) => setEditDraft((d) => ({ ...d, slip: e.target.checked }))}
                                />
                              </td>
                              <td className="py-1 pr-2 text-slate-400">{r.recordedByName}</td>
                              <td className="py-1 pr-2">
                                <input
                                  type="text"
                                  value={editDraft.note}
                                  onChange={(e) => setEditDraft((d) => ({ ...d, note: e.target.value }))}
                                  className="w-24 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                                />
                              </td>
                              <td className="py-1">
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => saveEdit(row.itemId, r.id)}
                                    className="rounded bg-slate-900 px-2 py-0.5 text-[11px] text-white"
                                  >
                                    저장
                                  </button>
                                  <button
                                    onClick={() => setEditingReceiptId(null)}
                                    className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600"
                                  >
                                    취소
                                  </button>
                                </div>
                                {historyError[r.id] && <p className="text-red-600">{historyError[r.id]}</p>}
                              </td>
                            </tr>
                          ) : (
                            <tr key={r.id} className="border-t border-slate-100">
                              <td className="py-1">{r.receivedDate}</td>
                              <td className="py-1">{r.receivedQty}</td>
                              <td className="py-1">{r.hasPackingSlip ? 'O' : 'X'}</td>
                              <td className="py-1 text-slate-400">{r.recordedByName}</td>
                              <td className="py-1 text-slate-400">{r.note ?? ''}</td>
                              <td className="py-1">
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => startEdit(r)}
                                    className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100"
                                  >
                                    수정
                                  </button>
                                  <button
                                    onClick={() => deleteReceipt(row.itemId, r.id)}
                                    className="rounded border border-red-200 px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50"
                                  >
                                    삭제
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </td>
                </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
