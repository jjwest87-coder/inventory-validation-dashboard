import { db } from '../src/lib/db';
import { recordActualCount, recordPurchaseOrder } from '../src/lib/inventory';

const MASTER_ID = 'L20111';

const NAME_TO_ID: Record<string, string> = {
  김지정: 'L20111',
  김지연: 'L20018',
  정지은: 'L20113',
  권혁규: 'L20143',
  조준범: 'L20112',
  남모현: 'L21048',
  나수진: 'L23093',
  송강욱: 'L21054',
  임희주: 'L21233',
  김세훈: 'L24226',
};

type Num = number | [number, number]; // single value, or [original, corrected]

type Row = { code: string; assignee: string; actual?: Num; order?: Num };

const ROWS: Row[] = [
  { code: 'GC0006', assignee: '권혁규', actual: 3 },
  { code: 'GC0007', assignee: '권혁규', actual: 3 },
  { code: 'GC0032', assignee: '권혁규', actual: 1 },
  { code: 'GC0039', assignee: '권혁규', actual: 4, order: 6 },
  { code: 'GC0041', assignee: '권혁규', actual: 1 },
  { code: 'GC0043', assignee: '권혁규', actual: 2 },
  { code: 'GC0045', assignee: '권혁규', actual: 23, order: 15 },
  { code: 'GC0054', assignee: '권혁규', actual: 6 },
  { code: 'GC0057', assignee: '권혁규', actual: 2, order: 2 },
  { code: 'GC0059', assignee: '권혁규', actual: 15 },
  { code: 'GC0060', assignee: '김지연', actual: 0 },
  { code: 'GC0061', assignee: '김지연', actual: 24, order: 10 },
  { code: 'GC0063', assignee: '김지연', actual: 26, order: 20 },
  { code: 'GC0065', assignee: '김지연', actual: 18, order: 40 },
  { code: 'GC0090', assignee: '김지연', actual: 4, order: 0 },
  { code: 'GC0091', assignee: '김지연', actual: 3 },
  { code: 'GC0092', assignee: '김지연', actual: 1 },
  { code: 'GC0093', assignee: '김지연', actual: 11 },
  { code: 'GC0094', assignee: '김지연', actual: 0, order: 1 },
  { code: 'GC0096', assignee: '김지연', actual: 2 },
  { code: 'GC0291', assignee: '김지연', actual: 0 },
  { code: 'GC0307', assignee: '김지연', actual: 0 },
  { code: 'GC0344', assignee: '임희주', actual: 1 },
  { code: 'GC0409', assignee: '임희주', actual: 1 },
  { code: 'GC0455', assignee: '임희주', actual: 1 },
  { code: 'GC0463', assignee: '임희주', actual: 7 },
  { code: 'GC0468', assignee: '임희주', actual: 37 },
  { code: 'GC0469', assignee: '임희주', actual: 25 },
  { code: 'GC0470', assignee: '임희주', actual: 28 },
  { code: 'GC0475', assignee: '임희주', actual: 4 },
  { code: 'MD0002', assignee: '남모현', actual: 5 },
  { code: 'MD0003', assignee: '남모현', actual: 3.4 },
  { code: 'MD0004', assignee: '남모현', actual: 1.6, order: 2 },
  { code: 'MD0005', assignee: '남모현', actual: [2.4, 2.0], order: 2 },
  { code: 'MD0006', assignee: '남모현', actual: 1.5 },
  { code: 'MD0007', assignee: '남모현', actual: [20.6, 20.4], order: 10 },
  { code: 'MD0008', assignee: '남모현', actual: 5.5 },
  { code: 'MD0009', assignee: '남모현', actual: 6.8, order: 2 },
  { code: 'MD0010', assignee: '남모현', actual: 6.6, order: 2 },
  { code: 'MD0027', assignee: '남모현', actual: [182.2, 181] },
  { code: 'MD0028', assignee: '남모현', actual: 3.2 },
  // MD0029: no data given — skipped
  { code: 'MD0038', assignee: '남모현', actual: 14.6, order: 6 },
  { code: 'MD0039', assignee: '남모현', actual: 5.6, order: 2 },
  { code: 'MD0134', assignee: '남모현', actual: 3.6, order: 2 },
  { code: 'MD0135', assignee: '남모현', actual: 3.6, order: 2 },
  { code: 'MD0138', assignee: '남모현', actual: 5.1 },
  { code: 'MD0139', assignee: '남모현', actual: 4.1 },
  { code: 'MR0894', assignee: '조준범', actual: 9, order: 10 },
  { code: 'MR0896', assignee: '조준범', actual: 9, order: 10 },
  { code: 'MR0902', assignee: '조준범', actual: 10, order: [14, 16] },
  { code: 'MR0903', assignee: '조준범', actual: 4, order: [7, 8] },
  { code: 'MR0904', assignee: '조준범', actual: [9, 9.5] },
  { code: 'MR0905', assignee: '조준범', actual: 5, order: 10 },
  { code: 'MR0910', assignee: '조준범', actual: [20, 21] },
  { code: 'MR1497', assignee: '조준범', actual: 3, order: 6 },
  { code: 'MR1498', assignee: '조준범', actual: 4, order: 2 },
  { code: 'MR1585', assignee: '나수진', actual: 8.5, order: 7 },
  { code: 'MR1586', assignee: '남모현', actual: 15, order: 8 },
  { code: 'MR1587', assignee: '남모현', actual: 9.1, order: 8 },
  { code: 'MR1589', assignee: '남모현', actual: 17.6 },
  { code: 'MR1590', assignee: '남모현', actual: 20.4, order: 16 },
  { code: 'MR1591', assignee: '남모현', actual: 15, order: 16 },
  { code: 'MR1592', assignee: '남모현', actual: 15, order: 16 },
  { code: 'MR1593', assignee: '남모현', actual: 15, order: 16 },
  { code: 'MR1594', assignee: '남모현', actual: 0.6 },
  { code: 'MR1595', assignee: '남모현', actual: 0.8 },
  { code: 'MR1601', assignee: '남모현', actual: 61.7, order: 56 },
  { code: 'MR1603', assignee: '나수진', actual: 12 },
  { code: 'MR1606', assignee: '나수진', actual: 3, order: 12 },
  { code: 'MR1620', assignee: '나수진', actual: 2, order: [13, 15] },
  { code: 'MR1626', assignee: '나수진', actual: 1 },
  { code: 'MR1627', assignee: '나수진', actual: 0.6 },
  { code: 'MR1713', assignee: '남모현', actual: 12, order: 16 },
  { code: 'MR2314', assignee: '남모현', actual: 20.3, order: 24 },
  { code: 'SR0002', assignee: '나수진', actual: 0.4 },
  { code: 'SR0076', assignee: '임희주', actual: 1 },
  { code: 'SR0128', assignee: '남모현', actual: 3.2, order: 5 },
  { code: 'SR0129', assignee: '나수진', actual: 0.8 },
  { code: 'SR0130', assignee: '나수진', actual: 0.5 },
  { code: 'SR0131', assignee: '나수진', actual: 0.9 },
  { code: 'SR0133', assignee: '임희주', actual: 0, order: 1 },
  { code: 'SR0158', assignee: '나수진', actual: 0.9 },
  { code: 'SR0464', assignee: '임희주', actual: 0.6 },
  { code: 'SR0506', assignee: '임희주', actual: 1, order: 1 },
  { code: 'SR0549', assignee: '나수진', actual: 7.6 },
  { code: 'SR0550', assignee: '김세훈', actual: 1.5 },
  { code: 'SR0551', assignee: '김세훈', actual: 2, order: [3, 4] },
  { code: 'SR0552', assignee: '정지은', actual: 1.2, order: 1 },
  { code: 'SR0605', assignee: '정지은', actual: 7 },
  { code: 'TC0069', assignee: '정지은', actual: 15 },
  { code: 'TC0071', assignee: '정지은', actual: 12 },
  { code: 'TC0080', assignee: '정지은', actual: 7, order: 3 },
  { code: 'TC0082', assignee: '정지은', actual: 7, order: 3 },
  { code: 'TC0083', assignee: '송강욱', actual: 7 },
  { code: 'TC0084', assignee: '정지은', actual: 5 },
  { code: 'TC0105', assignee: '정지은', actual: 0.6, order: 2 },
  { code: 'TC0107', assignee: '정지은', actual: 0.2 },
  { code: 'TC0109', assignee: '정지은', actual: 4 },
  { code: 'TC0112', assignee: '송강욱', actual: 1.6 },
  { code: 'TC0113', assignee: '송강욱', actual: 1.5 },
  { code: 'TC0115', assignee: '송강욱', actual: 4 },
  { code: 'TC0116', assignee: '김세훈', actual: 7, order: 3 },
  { code: 'TC0117', assignee: '김세훈', actual: [11, 8], order: 7 },
  { code: 'TC0118', assignee: '김세훈', actual: 6 },
  { code: 'TC0119', assignee: '김세훈', actual: 5 },
  { code: 'TC0123', assignee: '송강욱', actual: 5 },
  { code: 'TC0124', assignee: '송강욱', actual: 13 },
  { code: 'TC0288', assignee: '송강욱', actual: 12 },
  { code: 'TC0289', assignee: '송강욱', actual: 8 },
  { code: 'TC0290', assignee: '송강욱', actual: 2, order: [4, 3] },
  { code: 'TC0293', assignee: '송강욱', actual: 11 },
  { code: 'TC0294', assignee: '송강욱', actual: 8, order: [7, 6] },
  { code: 'TC0296', assignee: '송강욱', actual: 7 },
  { code: 'TC0386', assignee: '김세훈', actual: 2, order: 2 },
  { code: 'TC0387', assignee: '김세훈', actual: 2, order: 2 },
  { code: 'TC0388', assignee: '김세훈', actual: 2, order: 2 },
  { code: 'TC0413', assignee: '송강욱', actual: 3.5 },
  { code: 'TC0560', assignee: '송강욱', actual: 0 },
  { code: 'TC0636', assignee: '송강욱', actual: 0 },
  { code: 'TC0719', assignee: '김세훈', actual: 1, order: 1 },
  { code: 'TC0749', assignee: '송강욱', actual: 7 },
  { code: 'TC0750', assignee: '송강욱', actual: 11, order: 7 },
];

async function main() {
  const JUNE = '2026-06';
  const JULY = '2026-07';

  let actualCount = 0;
  let orderCount = 0;
  let correctionCount = 0;
  const notFound: string[] = [];

  for (const row of ROWS) {
    const item = await db.item.findUnique({ where: { code: row.code } });
    if (!item) {
      notFound.push(row.code);
      continue;
    }
    const staffId = NAME_TO_ID[row.assignee];
    if (!staffId) {
      console.warn(`Unknown assignee name "${row.assignee}" for ${row.code}`);
      continue;
    }

    if (row.actual !== undefined) {
      if (Array.isArray(row.actual)) {
        await recordActualCount(item.id, JUNE, row.actual[0], staffId);
        await recordActualCount(item.id, JUNE, row.actual[1], MASTER_ID);
        correctionCount++;
      } else {
        await recordActualCount(item.id, JUNE, row.actual, staffId);
      }
      actualCount++;
    }

    if (row.order !== undefined) {
      if (Array.isArray(row.order)) {
        await recordPurchaseOrder(item.id, JULY, row.order[0], staffId);
        await recordPurchaseOrder(item.id, JULY, row.order[1], MASTER_ID);
        correctionCount++;
      } else {
        await recordPurchaseOrder(item.id, JULY, row.order, staffId);
      }
      orderCount++;
    }
  }

  console.log(`6월 실사 ${actualCount}건, 7월 발주 ${orderCount}건 입력, 수정 이력 ${correctionCount}건 생성`);
  if (notFound.length > 0) {
    console.warn('DB에서 찾지 못한 품목코드:', notFound);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
