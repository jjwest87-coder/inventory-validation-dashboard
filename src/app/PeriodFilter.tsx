'use client';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function yearOptions() {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current - 1; y <= current + 2; y++) years.push(y);
  return years;
}

export default function PeriodFilter({
  basePath = '/',
  year,
  month,
  assignee,
  staffOptions,
  summary,
}: {
  basePath?: string;
  year: number;
  month: number;
  assignee?: string;
  staffOptions?: { id: string; name: string }[];
  summary?: React.ReactNode;
}) {
  function navigate(params: { year: number; month: number; assignee?: string }) {
    const query: Record<string, string> = { year: String(params.year), month: String(params.month) };
    if (params.assignee !== undefined) query.assignee = params.assignee;
    const search = new URLSearchParams(query);
    window.location.href = `${basePath}?${search.toString()}`;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 print:hidden">
      <span className="text-sm text-slate-500">조회 월</span>
      <select
        value={year}
        onChange={(e) => navigate({ year: Number(e.target.value), month, assignee })}
        className="rounded border border-slate-300 px-2 py-1 text-sm"
      >
        {yearOptions().map((y) => (
          <option key={y} value={y}>
            {y}년
          </option>
        ))}
      </select>
      <select
        value={month}
        onChange={(e) => navigate({ year, month: Number(e.target.value), assignee })}
        className="rounded border border-slate-300 px-2 py-1 text-sm"
      >
        {MONTHS.map((m) => (
          <option key={m} value={m}>
            {m}월
          </option>
        ))}
      </select>

      {summary && <span className="ml-2">{summary}</span>}

      {staffOptions && assignee !== undefined && (
        <>
          <span className="ml-4 text-sm text-slate-500">담당자</span>
          <select
            value={assignee}
            onChange={(e) => navigate({ year, month, assignee: e.target.value })}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="all">전체</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.id})
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
