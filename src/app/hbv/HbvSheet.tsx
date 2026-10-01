'use client';

import { Fragment, type CSSProperties } from 'react';

export type HbvRow = {
  no: number;
  itemId: number;
  code: string;
  name: string;
  lotNumber: string;
  qty: number | null;
  // Placeholder row for a 다음달 발주 not yet received — LOT/수량 are written by hand.
  blank: boolean;
};

export type HbvGroup = { key: string; title: string; storage: string; rows: HbvRow[] };

// Blank boxes for hand-writing each 사용일자 (top) and the 남은수량 after it (bottom).
const USE_SLOTS = 10;

// A4 landscape is 210mm tall; minus 8mm margins top/bottom and ~26mm for the title and
// table header, this is what the LOT rows can use so each group stays on one page.
const PRINT_BODY_MM = 160;
const MAX_ROW_MM = 7;

// Alternating band per LOT (its 사용일자 row and 남은수량 row share the colour).
const BANDS = ['bg-white', 'bg-sky-100'];

const cell = 'border border-slate-400 px-1.5 py-1 print:border-black print:px-1 print:py-0';

function rowKey(r: HbvRow) {
  return r.blank ? `${r.itemId}:blank` : `${r.itemId}:${r.lotNumber}`;
}

function GroupTable({ group, yearMonth }: { group: HbvGroup; yearMonth: string }) {
  const [y, m] = yearMonth.split('-');
  const rowMm = Math.min(MAX_ROW_MM, PRINT_BODY_MM / Math.max(1, group.rows.length * 2));
  const tableStyle = { '--row-h': `${rowMm.toFixed(2)}mm` } as CSSProperties;
  const tr = 'h-7 print:h-[var(--row-h)]';

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 print:break-inside-avoid print:break-after-page print:rounded-none print:border-0 print:p-0 print:last:break-after-auto">
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
        <table
          style={tableStyle}
          className="w-full min-w-[960px] table-fixed border-collapse text-center text-xs text-slate-800 print:min-w-0 print:text-[10px] print:text-black print:[print-color-adjust:exact] print:[-webkit-print-color-adjust:exact]"
        >
          <colgroup>
            <col className="w-9" />
            <col className="w-20" />
            <col className="w-60 print:w-56" />
            <col className="w-20" />
            <col className="w-12" />
            {Array.from({ length: USE_SLOTS }, (_, i) => (
              <col key={i} />
            ))}
            <col className="w-24" />
          </colgroup>
          <thead className="bg-slate-200">
            <tr>
              <th rowSpan={2} className={cell}>No.</th>
              <th rowSpan={2} className={cell}>품목코드</th>
              <th rowSpan={2} className={cell}>품명</th>
              <th rowSpan={2} className={cell}>Lot.</th>
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
              const band = BANDS[idx % BANDS.length];
              return (
                <Fragment key={rowKey(r)}>
                  <tr className={`${tr} ${band} ${firstOfItem && idx > 0 ? 'border-t-[3px] border-t-slate-700' : ''}`}>
                    <td rowSpan={2} className={cell}>{firstOfItem ? r.no : ''}</td>
                    <td rowSpan={2} className={`${cell} font-mono`}>{r.code}</td>
                    <td rowSpan={2} className={`${cell} text-left leading-tight`}>{r.name}</td>
                    <td rowSpan={2} className={`${cell} font-mono`}>{r.lotNumber}</td>
                    <td rowSpan={2} className={`${cell} text-sm font-bold print:text-xs`}>{r.qty}</td>
                    {Array.from({ length: USE_SLOTS }, (_, i) => (
                      <td key={i} className={cell} />
                    ))}
                    <td rowSpan={2} className={cell} />
                  </tr>
                  <tr className={`${tr} ${band}`}>
                    {Array.from({ length: USE_SLOTS }, (_, i) => (
                      <td key={i} className={cell} />
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
      <style>{'@page { size: A4 landscape; margin: 8mm; }'}</style>
      <div className="flex items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-slate-500">냉장보관 / 실온보관 각 1장씩 A4 가로로 출력됩니다.</p>
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
