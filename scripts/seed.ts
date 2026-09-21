import path from 'path';
import bcrypt from 'bcryptjs';
import XLSX from 'xlsx';
import { db } from '../src/lib/db';

const ROSTER: { id: string; name: string; role: 'MASTER' | 'STAFF' }[] = [
  { id: 'L20111', name: '김지정', role: 'MASTER' },
  { id: 'L20018', name: '김지연', role: 'STAFF' },
  { id: 'L20113', name: '정지은', role: 'STAFF' },
  { id: 'L20143', name: '권혁규', role: 'STAFF' },
  { id: 'L20112', name: '조준범', role: 'STAFF' },
  { id: 'L21048', name: '남모현', role: 'STAFF' },
  { id: 'L23093', name: '나수진', role: 'STAFF' },
  { id: 'L21054', name: '송강욱', role: 'STAFF' },
  { id: 'L21233', name: '임희주', role: 'STAFF' },
  { id: 'L24226', name: '김세훈', role: 'STAFF' },
];

const RAW_DIR = path.join(__dirname, '..', 'data', 'raw');
const ASSIGNEE_FILE = path.join(RAW_DIR, '품목별 담당자.xlsx');
const USAGE_FILE = path.join(RAW_DIR, '품목별 사용량 추이 조회.xlsx');

const MONTH_COLUMNS = [
  { idx: 16, ym: '2026-01' },
  { idx: 17, ym: '2026-02' },
  { idx: 18, ym: '2026-03' },
  { idx: 19, ym: '2026-04' },
  { idx: 20, ym: '2026-05' },
  { idx: 21, ym: '2026-06' },
  { idx: 22, ym: '2026-07' },
  { idx: 23, ym: '2026-08' },
];

function readRows(file: string): unknown[][] {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) as unknown[][];
}

async function main() {
  const nameToId = new Map(ROSTER.map((r) => [r.name, r.id]));

  console.log('Seeding staff...');
  for (const person of ROSTER) {
    const passwordHash = await bcrypt.hash('1111', 10);
    db.staff.upsert({
      where: { id: person.id },
      update: { name: person.name, role: person.role },
      create: { id: person.id, name: person.name, role: person.role, passwordHash },
    });
  }

  console.log('Seeding items from 품목별 담당자.xlsx...');
  const assigneeRows = readRows(ASSIGNEE_FILE).slice(1); // skip header
  let itemCount = 0;
  const unmatchedAssignees = new Set<string>();

  for (const row of assigneeRows) {
    const [, code, name, spec, type, manufacturer, assigneeName] = row as string[];
    if (!code) continue;
    const assigneeId = assigneeName ? nameToId.get(String(assigneeName).trim()) ?? null : null;
    if (assigneeName && !assigneeId) unmatchedAssignees.add(String(assigneeName));

    db.item.upsert({
      where: { code: String(code) },
      update: {
        name: String(name ?? ''),
        spec: spec ? String(spec) : null,
        type: type ? String(type) : null,
        manufacturer: manufacturer ? String(manufacturer) : null,
        assigneeId,
      },
      create: {
        code: String(code),
        name: String(name ?? ''),
        spec: spec ? String(spec) : null,
        type: type ? String(type) : null,
        manufacturer: manufacturer ? String(manufacturer) : null,
        assigneeId,
      },
    });
    itemCount++;
  }
  console.log(`  -> ${itemCount} items upserted`);
  if (unmatchedAssignees.size > 0) {
    console.warn('  !! Unmatched assignee names (item left unassigned):', [...unmatchedAssignees]);
  }

  console.log('Seeding usage history from 품목별 사용량 추이 조회.xlsx...');
  const usageRows = readRows(USAGE_FILE).slice(2); // skip 2 header rows
  let usageCount = 0;
  const missingItemCodes = new Set<string>();

  for (const row of usageRows) {
    const code = row[4] as string;
    if (!code) continue;

    let item = db.item.findUnique({ where: { code: String(code) } });
    if (!item) {
      const name = (row[5] as string) ?? '';
      const spec = (row[6] as string) ?? null;
      const type = (row[3] as string) ?? null;
      const manufacturer = (row[8] as string) ?? null;
      item = db.item.create({
        data: { code: String(code), name: String(name), spec, type, manufacturer },
      });
      missingItemCodes.add(String(code));
    }

    for (const { idx, ym } of MONTH_COLUMNS) {
      const value = row[idx];
      if (value === '' || value == null) continue;
      const outboundQty = Number(value);
      if (!Number.isFinite(outboundQty)) continue;

      db.usageHistory.upsert({
        where: { itemId_yearMonth: { itemId: item.id, yearMonth: ym } },
        update: { outboundQty, source: 'imported' },
        create: { itemId: item.id, yearMonth: ym, outboundQty, source: 'imported' },
      });
      usageCount++;
    }
  }
  console.log(`  -> ${usageCount} usage records upserted`);
  if (missingItemCodes.size > 0) {
    console.warn('  !! Items created from usage file only (no assignee):', [...missingItemCodes]);
  }

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
