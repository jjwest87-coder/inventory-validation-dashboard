'use client';

import { Fragment, useState } from 'react';

export type HbvRow = {
  no: number;
  itemId: number;
  code: string;
  name: string;
  lotNumber: string;
  qty: number;
  receivedDate: string;
};

export type HbvGroup = { key: string; title: string; storage: string; rows: HbvRow[] };

// Blank boxes for hand-writing each 사용일자 (top) and the 남은수량 after it (bottom).
const USE_SLOTS = 10;

const cell = 'border border-slate-400 px-1.5 py-1 print:border-black print:px-1 print:py-0';

function rowKey(r: HbvRow) {
  return `${r.itemId}:${r.lotNumber}`;
}

function ReceivedDateInput({ row }: { row: HbvRow }) {
  const [value, setValue] = useState(row.receivedDate);
  const [saved, setSaved] = useState(row.receivedDate);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  async function save() {
    const next = value.trim();
    if (next === saved) return;
    setStatus('saving');
    const res = await fetch('/api/hbv/received-date', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: row.itemId, lotNumber: row.lotNumber, receivedDate: next }),
    }).catch(() => null);
    if (res?.ok) {
      setSaved(next);
      setValue(next);
      setStatus('idle');
    } else {
      setStatus('error');
    }
  }

  return (
    <>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        placeholder="YY.MM.DD"
        title={status === 'error' ? '저장 실패 — 다시 시도해주세요.' : '입력 후 Enter 또는 칸을 벗어나면 저장됩니다.'}
        className={`w-20 rounded border px-1 py-0.5 text-center text-xs print:hidden ${
          status === 'error'
            ? 'border-red-400 bg-red-50'
            : status === 'saving'
              ? 'border-slate-300 bg-slate-100'
              : 'border-slate-300'
        }`}
      />
      <span className="hidden print:inline">{saved}</span>
    </>
  );
}

function GroupTable({ group, yearMonth }: { group: HbvGroup; yearMonth: string }) {
  const [y, m] = yearMonth.split('-');
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 print:break-after-page print:rounded-none print:border-0 print:p-0">
      <div className="mb-2 flex items-end justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900 print:text-lg print:text-black">{group.title}</h2>
          <p className="text-sm font-semibold text-slate-700 print:text-black">&lt;{group.storage}&gt;</p>
        </div>
        <p className="text-xs text-slate-500 print:text-black">
          {y}년 {Number(m)}월 재고실사 기준
        </p>
      </div>
      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full min-w-[960px] table-fixed border-collapse text-center text-xs text-slate-800 print:min-w-0 print:text-[10px] print:text-black">
          <colgroup>
            <col className="w-9" />
            <col className="w-20" />
            <col className="w-56 print:w-48" />
            <col className="w-20" />
            <col className="w-24 print:w-16" />
            <col className="w-12" />
            {Array.from({ length: USE_SLOTS }, (_, i) => (
              <col key={i} />
            ))}
            <col className="w-20" />
          </colgroup>
          <thead className="bg-slate-100 print:bg-transparent">
            <tr>
              <th rowSpan={2} className={cell}>No.</th>
              <th rowSpan={2} className={cell}>품목코드</th>
              <th rowSpan={2} className={cell}>품명</th>
              <th rowSpan={2} className={cell}>Lot.</th>
              <th rowSpan={2} className={cell}>입고일</th>
              <th rowSpan={2} className={cell}>수량</th>
              <th colSpan={USE_SLOTS} className={cell}>사용일자</th>
              <th rowSpan={2} className={cell}>비고</th>
            </tr>
            <tr>
              <th colSpan={USE_SLOTS} className={`${cell} font-normal`}>재고량 (남은수량)</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((r, idx) => {
              const firstOfItem = idx === 0 || group.rows[idx - 1].itemId !== r.itemId;
              return (
                <Fragment key={rowKey(r)}>
                  <tr className={`h-7 print:h-[7mm] ${firstOfItem && idx > 0 ? 'border-t-2 border-t-slate-500' : ''}`}>
                    <td rowSpan={2} className={cell}>{firstOfItem ? r.no : ''}</td>
                    <td rowSpan={2} className={`${cell} font-mono`}>{r.code}</td>
                    <td rowSpan={2} className={`${cell} text-left leading-tight`}>{r.name}</td>
                    <td rowSpan={2} className={`${cell} font-mono`}>{r.lotNumber}</td>
                    <td rowSpan={2} className={cell}>
                      <ReceivedDateInput row={r} />
                    </td>
                    <td rowSpan={2} className={`${cell} text-sm font-bold print:text-xs`}>{r.qty}</td>
                    {Array.from({ length: USE_SLOTS }, (_, i) => (
                      <td key={i} className={cell} />
                    ))}
                    <td rowSpan={2} className={cell} />
                  </tr>
                  <tr className="h-7 print:h-[7mm]">
                    {Array.from({ length: USE_SLOTS }, (_, i) => (
                      <td key={i} className={`${cell} bg-slate-50 print:bg-transparent`} />
                    ))}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function HbvSheet({ yearMonth, groups }: { yearMonth: string; groups: HbvGroup[] }) {
  return (
    <div className="flex flex-col gap-6 print:gap-0">
      {/* Scoped to this page only: the dashboard's own print layout stays portrait. */}
      <style>{'@page { size: A4 landscape; margin: 10mm; }'}</style>
      <div className="flex items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-slate-500">
          입고일은 Lot별로 한 번 입력하면 다음 달 시트에도 그대로 이어집니다. 냉장/실온 각 1장씩 출력됩니다.
        </p>
        <button
          onClick={() => window.print()}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          출력
        </button>
      </div>
      {groups.map((g) => (
        <GroupTable key={g.key} group={g} yearMonth={yearMonth} />
      ))}
    </div>
  );
}
