'use client';

import { useState } from 'react';
import { checkOrderMultiple } from '@/lib/orderRules';

type HistoryEntry = { oldValue: number | null; newValue: number; changedByName: string; changedAt: Date };

type Row = {
  itemId: number;
  code: string;
  name: string;
  spec: string | null;
  manufacturer: string | null;
  orderMultiple: number | null;
  note: string | null;
  assigneeId: string | null;
  assigneeName: string;
  prevActualCount: number | null;
  incomingQty: number;
  actualCount: number | null;
  expectedCount: number | null;
  previousStock: number | null;
  variance: number | null;
  flagged: boolean;
  isBaseline: boolean;
  submittedAt: Date | null;
  submittedByName: string | null;
  nextOrderedQty: number | null;
  twoMonthUsageEstimate: number | null;
  actualCountHistory: HistoryEntry[];
  nextOrderHistory: HistoryEntry[];
  lots: { id: number; lotNumber: string; count: number | null }[];
};

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** True when stock rose with no incoming this month — physically shouldn't happen without a shipment. */
function isNoIncomingIncrease(row: Row): boolean {
  return (
    !row.isBaseline &&
    row.incomingQty === 0 &&
    row.previousStock != null &&
    row.actualCount != null &&
    row.actualCount > row.previousStock
  );
}

/** Renders "이전값 → ... → 최신값 (수정: 이름)" only when a real correction happened. */
function CorrectionNote({ history }: { history: HistoryEntry[] }) {
  const hasCorrection = history.some((h, i) => i > 0 || h.oldValue != null);
  if (!hasCorrection) return null;
  const first = history[0].oldValue;
  const chain = (first != null ? [first, ...history.map((h) => h.newValue)] : history.map((h) => h.newValue)).join(
    ' → ',
  );
  const last = history[history.length - 1];
  return (
    <p className="mt-1 text-[11px] text-amber-600 print:hidden">
      수정: {chain} ({last.changedByName})
    </p>
  );
}

export default function InventoryTable({
  yearMonth,
  nextYearMonth,
  initialRows,
  currentStaffName,
}: {
  yearMonth: string;
  nextYearMonth: string;
  initialRows: Row[];
  currentStaffName: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [actualDrafts, setActualDrafts] = useState<Record<number, string>>(
    Object.fromEntries(initialRows.map((r) => [r.itemId, r.actualCount == null ? '' : String(r.actualCount)])),
  );
  const [orderDrafts, setOrderDrafts] = useState<Record<number, string>>(
    Object.fromEntries(initialRows.map((r) => [r.itemId, r.nextOrderedQty == null ? '' : String(r.nextOrderedQty)])),
  );
  const [lotDrafts, setLotDrafts] = useState<Record<number, Record<number, string>>>(
    Object.fromEntries(
      initialRows.map((r) => [
        r.itemId,
        Object.fromEntries(r.lots.map((l) => [l.id, l.count == null ? '' : String(l.count)])),
      ]),
    ),
  );
  const [rowError, setRowError] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  async function saveAll() {
    setSaving(true);
    setSummary(null);
    setRowError({});

    // LOT-tracked items skip the plain actualCount input entirely (see render below),
    // so exclude them from recordEntries and save them via /api/lot-counts instead.
    const recordEntries = rows
      .filter((r) => r.lots.length === 0 && actualDrafts[r.itemId] !== '')
      .map((r) => ({ itemId: r.itemId, actualCount: Number(actualDrafts[r.itemId]) }));
    const orderEntries = rows
      .filter((r) => orderDrafts[r.itemId] !== '')
      .map((r) => ({ itemId: r.itemId, orderedQty: Number(orderDrafts[r.itemId]) }));
    const lotEntries = rows
      .filter((r) => r.lots.length > 0 && r.lots.some((l) => lotDrafts[r.itemId]?.[l.id] !== ''))
      .map((r) => ({
        itemId: r.itemId,
        lotCounts: r.lots
          .filter((l) => lotDrafts[r.itemId]?.[l.id] !== '')
          .map((l) => ({ lotId: l.id, count: Number(lotDrafts[r.itemId][l.id]) })),
      }));

    if (recordEntries.length === 0 && orderEntries.length === 0 && lotEntries.length === 0) {
      setSummary('입력된 값이 없습니다.');
      setSaving(false);
      return;
    }

    try {
      const [recordsRes, ordersRes, lotsRes] = await Promise.all([
        recordEntries.length > 0
          ? fetch('/api/records', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ yearMonth, records: recordEntries }),
            }).then((r) => r.json().then((data) => ({ status: r.status, data })))
          : Promise.resolve(null),
        orderEntries.length > 0
          ? fetch('/api/purchase-orders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ targetYearMonth: nextYearMonth, orders: orderEntries }),
            }).then((r) => r.json().then((data) => ({ status: r.status, data })))
          : Promise.resolve(null),
        lotEntries.length > 0
          ? fetch('/api/lot-counts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ yearMonth, entries: lotEntries }),
            }).then((r) => r.json().then((data) => ({ status: r.status, data })))
          : Promise.resolve(null),
      ]);

      const newErrors: Record<number, string> = {};
      let successCount = 0;
      let failCount = 0;

      if (recordsRes) {
        if (recordsRes.status !== 200) {
          for (const e of recordEntries) newErrors[e.itemId] = recordsRes.data.error ?? '저장 실패';
          failCount += recordEntries.length;
        } else {
          for (const result of recordsRes.data.results) {
            if (result.ok) {
              successCount++;
              const rec = result.record;
              const changerName = recordsRes.data.submittedByName ?? currentStaffName;
              setRows((rs) =>
                rs.map((r) => {
                  if (r.itemId !== result.itemId) return r;
                  const changed = r.actualCount !== rec.actualCount;
                  return {
                    ...r,
                    incomingQty: rec.incomingQty,
                    actualCount: rec.actualCount,
                    expectedCount: rec.expectedCount,
                    previousStock: rec.previousStock,
                    variance: rec.variance,
                    flagged: rec.flagged,
                    isBaseline: rec.isBaseline,
                    submittedAt: rec.submittedAt,
                    submittedByName: changerName,
                    actualCountHistory: changed
                      ? [
                          ...r.actualCountHistory,
                          { oldValue: r.actualCount, newValue: rec.actualCount, changedByName: changerName, changedAt: new Date() },
                        ]
                      : r.actualCountHistory,
                  };
                }),
              );
            } else {
              failCount++;
              newErrors[result.itemId] = result.error ?? '저장 실패';
            }
          }
        }
      }

      if (ordersRes) {
        if (ordersRes.status !== 200) {
          for (const e of orderEntries) newErrors[e.itemId] = ordersRes.data.error ?? '발주 저장 실패';
          failCount += orderEntries.length;
        } else {
          for (const result of ordersRes.data.results) {
            if (result.ok) {
              successCount++;
              setRows((rs) =>
                rs.map((r) => {
                  if (r.itemId !== result.itemId) return r;
                  const changed = r.nextOrderedQty !== result.order.orderedQty;
                  return {
                    ...r,
                    nextOrderedQty: result.order.orderedQty,
                    nextOrderHistory: changed
                      ? [
                          ...r.nextOrderHistory,
                          {
                            oldValue: r.nextOrderedQty,
                            newValue: result.order.orderedQty,
                            changedByName: currentStaffName,
                            changedAt: new Date(),
                          },
                        ]
                      : r.nextOrderHistory,
                  };
                }),
              );
            } else {
              failCount++;
              newErrors[result.itemId] = result.error ?? '발주 저장 실패';
            }
          }
        }
      }

      if (lotsRes) {
        if (lotsRes.status !== 200) {
          for (const e of lotEntries) newErrors[e.itemId] = lotsRes.data.error ?? 'LOT 저장 실패';
          failCount += lotEntries.length;
        } else {
          for (const result of lotsRes.data.results) {
            if (result.ok) {
              successCount++;
              const rec = result.record;
              const changerName = lotsRes.data.submittedByName ?? currentStaffName;
              setRows((rs) =>
                rs.map((r) => {
                  if (r.itemId !== result.itemId) return r;
                  const changed = r.actualCount !== rec.actualCount;
                  return {
                    ...r,
                    incomingQty: rec.incomingQty,
                    actualCount: rec.actualCount,
                    expectedCount: rec.expectedCount,
                    previousStock: rec.previousStock,
                    variance: rec.variance,
                    flagged: rec.flagged,
                    isBaseline: rec.isBaseline,
                    submittedAt: rec.submittedAt,
                    submittedByName: changerName,
                    actualCountHistory: changed
                      ? [
                          ...r.actualCountHistory,
                          {
                            oldValue: r.actualCount,
                            newValue: rec.actualCount,
                            changedByName: changerName,
                            changedAt: new Date(),
                          },
                        ]
                      : r.actualCountHistory,
                  };
                }),
              );
            } else {
              failCount++;
              newErrors[result.itemId] = result.error ?? 'LOT 저장 실패';
            }
          }
        }
      }

      setRowError(newErrors);
      setSummary(failCount > 0 ? `${successCount}건 저장, ${failCount}건 실패` : `${successCount}건 저장 완료`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white print:rounded-none print:border-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 print:hidden">
        <p className="text-sm text-slate-500">
          실사 수량을 입력한 뒤 아래 <strong>전체 저장</strong> 버튼 한 번으로 한꺼번에 저장합니다.
          이번달 입고 수량은 입고 관리 화면에 기록된 값이 자동으로 반영됩니다. 담당자가 자리를
          비웠다면 다른 사람이 대신 입력해도 됩니다 (입력자가 함께 기록됩니다).
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {summary && <span className="text-xs text-slate-500">{summary}</span>}
          <button
            onClick={() => window.print()}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            목록 인쇄
          </button>
          <button
            onClick={saveAll}
            disabled={saving}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '전체 저장'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full min-w-[980px] text-left text-sm print:min-w-0 print:table-fixed print:text-[9px]">
          <thead className="bg-slate-50 text-slate-500 print:bg-transparent print:text-black">
            <tr>
              <th className="px-4 py-2 font-medium print:w-20 print:px-1 print:py-0.5">품목코드</th>
              <th className="px-4 py-2 font-medium print:w-32 print:px-1 print:py-0.5">품목명</th>
              <th className="px-4 py-2 font-medium print:hidden">규격</th>
              <th className="px-4 py-2 font-medium print:hidden">담당자</th>
              <th className="w-24 px-4 py-2 font-medium print:w-16 print:px-1 print:py-0.5">지난달 실사</th>
              <th className="w-24 px-4 py-2 font-medium print:w-16 print:px-1 print:py-0.5">이번달 입고</th>
              <th className="w-24 px-4 py-2 font-medium print:w-36 print:px-1 print:py-0.5">이번달 실사</th>
              <th className="w-24 px-4 py-2 font-medium print:hidden">예상수량</th>
              <th className="w-28 px-4 py-2 font-medium print:hidden">판정</th>
              <th className="w-28 px-4 py-2 font-medium print:hidden">
                다음달({nextYearMonth}) 발주
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const error = rowError[row.itemId];
              return (
                <tr
                  key={row.itemId}
                  className={`border-t border-slate-100 align-top print:break-inside-avoid print:[print-color-adjust:exact] print:[-webkit-print-color-adjust:exact] ${idx % 2 === 1 ? 'bg-slate-50 print:bg-slate-100' : ''}`}
                >
                  <td className="px-4 py-2 font-mono text-xs text-slate-600 print:px-1 print:py-0.5 print:text-[9px]">
                    {row.code}
                  </td>
                  <td
                    className={`px-4 py-2 text-slate-800 print:overflow-hidden print:whitespace-normal print:break-words print:px-1 print:py-0.5 print:text-[8px] print:leading-tight ${row.manufacturer ? 'cursor-help underline decoration-dotted decoration-slate-300 underline-offset-4 print:no-underline' : ''}`}
                    title={row.manufacturer ? `제조사: ${row.manufacturer}` : undefined}
                  >
                    {row.name}
                    {row.note && (
                      <div className="text-xs text-red-600 print:whitespace-normal print:text-[8px]">{row.note}</div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-500 print:hidden">{row.spec}</td>
                  <td className="px-4 py-2 text-slate-600 print:hidden">{row.assigneeName}</td>
                  <td className="px-4 py-2 text-slate-500 print:px-1 print:py-0.5 print:text-[10px]">
                    {row.prevActualCount ?? '-'}
                  </td>
                  <td className="px-4 py-2 text-slate-600 print:px-1 print:py-0.5 print:text-[10px]">
                    {row.incomingQty}
                  </td>
                  <td className="px-4 py-2 print:px-1 print:py-0.5">
                    {row.lots.length > 0 ? (
                      <>
                        <div className="flex flex-col gap-1 print:hidden">
                          {row.lots.map((lot) => (
                            <div key={lot.id} className="flex items-center gap-1">
                              <span
                                className="w-20 truncate font-mono text-[10px] text-slate-500"
                                title={lot.lotNumber}
                              >
                                {lot.lotNumber}
                              </span>
                              <input
                                type="number"
                                min={0}
                                value={lotDrafts[row.itemId]?.[lot.id] ?? ''}
                                onChange={(e) =>
                                  setLotDrafts((d) => ({
                                    ...d,
                                    [row.itemId]: { ...d[row.itemId], [lot.id]: e.target.value },
                                  }))
                                }
                                onWheel={(ev) => ev.currentTarget.blur()}
                                className="w-14 [appearance:textfield] rounded border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-sm font-bold text-sky-900 focus:border-sky-500 focus:bg-white focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              />
                            </div>
                          ))}
                          <div className="mt-0.5 flex items-center gap-1">
                            <span className="w-20 text-right text-xs font-semibold text-slate-500">합계</span>
                            <span className="w-14 text-center text-base font-bold text-blue-700">
                              {row.lots.reduce(
                                (sum, lot) => sum + (Number(lotDrafts[row.itemId]?.[lot.id]) || 0),
                                0,
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="hidden print:block">
                          {row.lots.map((lot) => (
                            <div key={lot.id} className="mb-1.5 flex items-center gap-1.5">
                              <span className="w-20 truncate font-mono text-[9px]">{lot.lotNumber}</span>
                              <span className="inline-block h-6 w-14 border border-black" />
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <input
                          type="number"
                          min={0}
                          value={actualDrafts[row.itemId] ?? ''}
                          onChange={(e) => setActualDrafts((d) => ({ ...d, [row.itemId]: e.target.value }))}
                          onWheel={(e) => e.currentTarget.blur()}
                          placeholder="실사 입력"
                          className="w-20 [appearance:textfield] rounded border border-sky-300 bg-sky-50 px-2 py-1 text-base font-bold text-sky-900 focus:border-sky-500 focus:bg-white focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none print:hidden"
                        />
                        <span className="hidden print:inline-block print:h-7 print:w-24 print:border print:border-black" />
                      </>
                    )}
                    {error && <p className="mt-1 text-xs text-red-600 print:hidden">{error}</p>}
                    <CorrectionNote history={row.actualCountHistory} />
                  </td>
                  <td className="px-4 py-2 text-slate-500 print:hidden">
                    {row.expectedCount == null ? '-' : round1(row.expectedCount)}
                  </td>
                  <td className="px-4 py-2 print:hidden">
                    {row.actualCount == null ? (
                      <span className="text-xs text-slate-400">미입력</span>
                    ) : row.isBaseline ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">기준월</span>
                    ) : row.flagged ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        확인필요 (
                        {isNoIncomingIncrease(row)
                          ? '입고 없이 증가'
                          : `${row.variance! > 0 ? '+' : ''}${round1(row.variance!)}`}
                        )
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        정상
                      </span>
                    )}
                    {row.submittedByName && (
                      <p className="mt-1 text-[11px] text-slate-400">입력: {row.submittedByName}</p>
                    )}
                  </td>
                  <td className="px-4 py-2 print:hidden">
                    {(() => {
                      const orderDraft = orderDrafts[row.itemId] ?? '';
                      const orderWarning =
                        orderDraft === '' ? null : checkOrderMultiple(row.orderMultiple, Number(orderDraft));
                      return (
                        <>
                          <input
                            type="number"
                            min={0}
                            value={orderDraft}
                            onChange={(e) => setOrderDrafts((d) => ({ ...d, [row.itemId]: e.target.value }))}
                            onWheel={(e) => e.currentTarget.blur()}
                            placeholder="발주 입력"
                            className={`w-20 [appearance:textfield] rounded border px-2 py-1 text-base font-bold [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                              orderWarning
                                ? 'border-red-400 bg-red-50 text-red-900 focus:border-red-500 focus:outline-none'
                                : 'border-slate-300 text-slate-900'
                            }`}
                          />
                          {row.orderMultiple != null && (
                            <p className="mt-1 text-[11px] text-slate-400">{row.orderMultiple}배수 발주</p>
                          )}
                          {row.twoMonthUsageEstimate != null && (
                            <p className="mt-1 text-[11px] text-slate-400">
                              2개월 예상: {round1(row.twoMonthUsageEstimate)}
                            </p>
                          )}
                          {orderWarning && <p className="mt-1 text-xs text-red-600">{orderWarning}</p>}
                        </>
                      );
                    })()}
                    <CorrectionNote history={row.nextOrderHistory} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
