import { db } from '@/lib/db';

export function currentYearMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function previousYearMonth(yearMonth: string) {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 1 - 1, 1); // go back one month
  return currentYearMonth(d);
}

export function nextYearMonth(yearMonth: string) {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + 1, 1); // go forward one month
  return currentYearMonth(d);
}

export function isValidYearMonth(yearMonth: unknown): yearMonth is string {
  return typeof yearMonth === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth);
}

export async function getReceivedQtyForMonth(itemId: number, yearMonth: string): Promise<number> {
  const order = await db.purchaseOrder.findUnique({
    where: { itemId_targetYearMonth: { itemId, targetYearMonth: yearMonth } },
  });
  if (!order) return 0;
  const receipts = await db.receipt.findMany({ where: { purchaseOrderId: { in: [order.id] } } });
  return receipts.reduce((sum, r) => sum + r.receivedQty, 0);
}

const RECENT_MONTHS_FOR_AVG = 3;
const MIN_FLAG_THRESHOLD = 2; // units
const FLAG_RATIO = 0.3; // 30% of average monthly usage

function recentYearMonths(yearMonth: string, count: number) {
  const months: string[] = [];
  let cur = yearMonth;
  for (let i = 0; i < count; i++) {
    cur = previousYearMonth(cur);
    months.push(cur);
  }
  return months;
}

export async function averageUsage(itemId: number, beforeYearMonth: string) {
  const months = recentYearMonths(beforeYearMonth, RECENT_MONTHS_FOR_AVG);
  const rows = await db.usageHistory.findMany({
    where: { itemId, yearMonth: { in: months } },
  });
  if (rows.length === 0) return null;
  const sum = rows.reduce((acc, r) => acc + r.outboundQty, 0);
  return sum / rows.length;
}

export type Expectation = {
  previousStock: number | null;
  expectedCount: number | null;
  avgUsageUsed: number | null;
  isBaseline: boolean;
};

export async function computeExpectation(
  itemId: number,
  yearMonth: string,
  incomingQty: number,
): Promise<Expectation> {
  const prevMonth = previousYearMonth(yearMonth);
  const prevRecord = await db.monthlyRecord.findUnique({
    where: { itemId_yearMonth: { itemId, yearMonth: prevMonth } },
  });

  if (!prevRecord || prevRecord.actualCount == null) {
    return { previousStock: null, expectedCount: null, avgUsageUsed: null, isBaseline: true };
  }

  const avgUsageUsed = await averageUsage(itemId, yearMonth);
  const expectedCount = prevRecord.actualCount + incomingQty - (avgUsageUsed ?? 0);

  return {
    previousStock: prevRecord.actualCount,
    expectedCount,
    avgUsageUsed,
    isBaseline: false,
  };
}

export function evaluateVariance(actualCount: number, expectedCount: number | null, avgUsageUsed: number | null) {
  if (expectedCount == null) return { variance: null, flagged: false };
  const variance = actualCount - expectedCount;
  const threshold = Math.max(MIN_FLAG_THRESHOLD, (avgUsageUsed ?? 0) * FLAG_RATIO);
  return { variance, flagged: Math.abs(variance) > threshold };
}

export async function upsertDerivedUsage(
  itemId: number,
  yearMonth: string,
  previousStock: number,
  incomingQty: number,
  actualCount: number,
) {
  const outboundQty = previousStock + incomingQty - actualCount;
  await db.usageHistory.upsert({
    where: { itemId_yearMonth: { itemId, yearMonth } },
    update: { outboundQty, source: 'derived' },
    create: { itemId, yearMonth, outboundQty, source: 'derived' },
  });
}

/**
 * Saves this month's physical count for an item and computes the anomaly check,
 * logging a ChangeLog entry whenever the value differs from what was there before
 * (so a later correction stays visible as "이전값 → 새값" rather than silently
 * overwriting who counted what).
 */
export async function recordActualCount(itemId: number, yearMonth: string, actualCount: number, staffId: string) {
  const existing = await db.monthlyRecord.findUnique({ where: { itemId_yearMonth: { itemId, yearMonth } } });
  const oldValue = existing?.actualCount ?? null;

  const incomingQty = await getReceivedQtyForMonth(itemId, yearMonth);
  const expectation = await computeExpectation(itemId, yearMonth, incomingQty);
  const { variance, flagged: varianceFlagged } = evaluateVariance(
    actualCount,
    expectation.expectedCount,
    expectation.avgUsageUsed,
  );

  // Physically impossible without a shipment: stock can only go down (or stay flat) between
  // counts if nothing came in — flag it even when the variance itself is within tolerance.
  const noIncomingIncrease =
    !expectation.isBaseline &&
    incomingQty === 0 &&
    expectation.previousStock != null &&
    actualCount > expectation.previousStock;

  const flagged = varianceFlagged || noIncomingIncrease;

  const record = await db.monthlyRecord.upsert({
    where: { itemId_yearMonth: { itemId, yearMonth } },
    update: {
      staffId,
      incomingQty,
      actualCount,
      previousStock: expectation.previousStock,
      expectedCount: expectation.expectedCount,
      avgUsageUsed: expectation.avgUsageUsed,
      variance,
      flagged,
      isBaseline: expectation.isBaseline,
      submittedAt: new Date(),
    },
    create: {
      itemId,
      yearMonth,
      staffId,
      incomingQty,
      actualCount,
      previousStock: expectation.previousStock,
      expectedCount: expectation.expectedCount,
      avgUsageUsed: expectation.avgUsageUsed,
      variance,
      flagged,
      isBaseline: expectation.isBaseline,
      submittedAt: new Date(),
    },
  });

  if (!expectation.isBaseline && expectation.previousStock != null) {
    await upsertDerivedUsage(itemId, yearMonth, expectation.previousStock, incomingQty, actualCount);
  }

  if (oldValue !== actualCount) {
    await db.changeLog.create({
      data: {
        entityType: 'monthly_record',
        entityKey: `${itemId}:${yearMonth}`,
        field: 'actualCount',
        oldValue,
        newValue: actualCount,
        changedBy: staffId,
      },
    });
  }

  // A correction here changes this month's previousStock/derived usage, which the next
  // month's (already-saved) expectedCount and avgUsageUsed were computed from — replay it
  // forward so a retroactive fix doesn't leave later months' 판정 stuck on stale numbers.
  await cascadeRecalculate(itemId, yearMonth);

  return record;
}

/**
 * After a month's actualCount is (re)saved, the next month's already-saved record — if any —
 * was computed from this month's previousStock/usage before this save, so it's now stale.
 * Re-running it (same count, same staff — nothing about *what was counted* changed) recomputes
 * its expectedCount/avgUsageUsed/variance and derived usage, and recurses to the month after
 * that, carrying the fix forward as far as saved records go.
 */
async function cascadeRecalculate(itemId: number, yearMonth: string) {
  const nextMonth = nextYearMonth(yearMonth);
  const nextRecord = await db.monthlyRecord.findUnique({
    where: { itemId_yearMonth: { itemId, yearMonth: nextMonth } },
  });
  if (!nextRecord || nextRecord.actualCount == null) return;

  await recordActualCount(itemId, nextMonth, nextRecord.actualCount, nextRecord.staffId);
}

/**
 * Saves this month's count per lot for an item, then rolls the sum up into the item's
 * actualCount via recordActualCount — so the anomaly check, history, etc. all keep working
 * unchanged, treating the lot total as the item's count.
 */
export async function recordLotCounts(
  itemId: number,
  yearMonth: string,
  lotCounts: { lotId: number; count: number }[],
  staffId: string,
) {
  for (const { lotId, count } of lotCounts) {
    await db.lotCount.upsert({
      where: { lotId_yearMonth: { lotId, yearMonth } },
      data: { count, recordedBy: staffId },
    });
  }
  const sum = lotCounts.reduce((total, l) => total + l.count, 0);
  return recordActualCount(itemId, yearMonth, sum, staffId);
}

/**
 * Saves a purchase order quantity, logging a ChangeLog entry on any correction.
 * An order of 0 means "nothing to order" — it is not persisted (or is removed if it
 * already existed), so it never shows up as a receiving-list entry with nothing to receive.
 */
export async function recordPurchaseOrder(itemId: number, targetYearMonth: string, orderedQty: number, staffId: string) {
  const existing = await db.purchaseOrder.findUnique({
    where: { itemId_targetYearMonth: { itemId, targetYearMonth } },
  });
  const oldValue = existing?.orderedQty ?? null;

  if (orderedQty === 0) {
    if (existing) {
      const receipts = await db.receipt.findMany({ where: { purchaseOrderId: { in: [existing.id] } } });
      if (receipts.length === 0) {
        await db.purchaseOrder.delete({ where: { id: existing.id } });
      } else {
        // Already has receiving history — keep the row (don't orphan the receipts), just zero the quantity.
        await db.purchaseOrder.upsert({
          where: { itemId_targetYearMonth: { itemId, targetYearMonth } },
          update: { orderedQty: 0, orderedBy: staffId },
          create: { itemId, targetYearMonth, orderedQty: 0, orderedAt: new Date().toISOString(), orderedBy: staffId },
        });
      }
    }

    if (oldValue !== null && oldValue !== 0) {
      await db.changeLog.create({
        data: {
          entityType: 'purchase_order',
          entityKey: `${itemId}:${targetYearMonth}`,
          field: 'orderedQty',
          oldValue,
          newValue: 0,
          changedBy: staffId,
        },
      });
    }

    return {
      itemId,
      targetYearMonth,
      orderedQty: 0,
      orderedAt: existing?.orderedAt ?? new Date().toISOString(),
      orderedBy: staffId,
    };
  }

  const order = await db.purchaseOrder.upsert({
    where: { itemId_targetYearMonth: { itemId, targetYearMonth } },
    update: { orderedQty, orderedBy: staffId },
    create: { itemId, targetYearMonth, orderedQty, orderedAt: new Date().toISOString(), orderedBy: staffId },
  });

  if (oldValue !== orderedQty) {
    await db.changeLog.create({
      data: {
        entityType: 'purchase_order',
        entityKey: `${itemId}:${targetYearMonth}`,
        field: 'orderedQty',
        oldValue,
        newValue: orderedQty,
        changedBy: staffId,
      },
    });
  }

  return order;
}

export type HistoryEntry = { oldValue: number | null; newValue: number; changedBy: string; changedAt: Date };

/** Groups ChangeLog rows by entityKey (`${itemId}:${yearMonth}`) for one entity type. */
export async function getHistoryMap(entityType: 'monthly_record' | 'purchase_order') {
  const rows = await db.changeLog.findByType(entityType);
  const map = new Map<string, HistoryEntry[]>();
  for (const row of rows) {
    const list = map.get(row.entityKey) ?? [];
    list.push({ oldValue: row.oldValue, newValue: row.newValue, changedBy: row.changedBy, changedAt: row.changedAt });
    map.set(row.entityKey, list);
  }
  return map;
}
