import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

export type Role = 'MASTER' | 'STAFF';

export interface StaffRow {
  id: string;
  name: string;
  passwordHash: string;
  role: Role;
  active: boolean;
  createdAt: Date;
}

export interface ItemRow {
  id: number;
  code: string;
  name: string;
  spec: string | null;
  type: string | null;
  manufacturer: string | null;
  assigneeId: string | null;
  supplierId: number | null;
  orderMultiple: number | null;
  note: string | null;
  active: boolean;
  createdAt: Date;
  assignee?: StaffRow | null;
  supplier?: SupplierRow | null;
}

export interface SupplierRow {
  id: number;
  name: string;
  color: string | null;
  contactName: string | null;
  contactPhone: string | null;
  createdAt: Date;
}

export interface UsageHistoryRow {
  id: number;
  itemId: number;
  yearMonth: string;
  outboundQty: number;
  source: string;
  createdAt: Date;
}

export interface PurchaseOrderRow {
  id: number;
  itemId: number;
  targetYearMonth: string;
  orderedQty: number;
  orderedAt: string;
  orderedBy: string;
  createdAt: Date;
}

export interface ReceiptRow {
  id: number;
  purchaseOrderId: number;
  receivedQty: number;
  receivedDate: string;
  hasPackingSlip: boolean;
  recordedBy: string;
  note: string | null;
  createdAt: Date;
}

export interface LotRow {
  id: number;
  itemId: number;
  yearMonth: string;
  lotNumber: string;
  createdAt: Date;
}

export interface LotCountRow {
  id: number;
  lotId: number;
  yearMonth: string;
  count: number;
  recordedBy: string;
  submittedAt: Date;
}

export interface ChangeLogRow {
  id: number;
  entityType: string;
  entityKey: string;
  field: string;
  oldValue: number | null;
  newValue: number;
  changedBy: string;
  changedAt: Date;
}

export interface MonthlyRecordRow {
  id: number;
  itemId: number;
  yearMonth: string;
  staffId: string;
  incomingQty: number;
  actualCount: number | null;
  previousStock: number | null;
  expectedCount: number | null;
  variance: number | null;
  avgUsageUsed: number | null;
  flagged: boolean;
  isBaseline: boolean;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Lazily created so importing this module never crashes a build step that runs before
// DATABASE_URL is available (e.g. static analysis) — only the first real query needs it.
let sqlClient: NeonQueryFunction<false, false> | null = null;
function getSql() {
  if (!sqlClient) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    sqlClient = neon(url);
  }
  return sqlClient;
}

async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  await ready;
  const sql = getSql();
  return (await sql.query(text, params)) as unknown as T[];
}

async function q1<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | undefined> {
  const rows = await q<T>(text, params);
  return rows[0];
}

async function ensureSchema(): Promise<void> {
  const sql = getSql();
  const statements = [
    `CREATE TABLE IF NOT EXISTS "Staff" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "passwordHash" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'STAFF',
      "active" INTEGER NOT NULL DEFAULT 1,
      "createdAt" TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "Supplier" (
      "id" SERIAL PRIMARY KEY,
      "name" TEXT NOT NULL UNIQUE,
      "color" TEXT,
      "contactName" TEXT,
      "contactPhone" TEXT,
      "createdAt" TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "Item" (
      "id" SERIAL PRIMARY KEY,
      "code" TEXT NOT NULL UNIQUE,
      "name" TEXT NOT NULL,
      "spec" TEXT,
      "type" TEXT,
      "manufacturer" TEXT,
      "assigneeId" TEXT REFERENCES "Staff"("id"),
      "supplierId" INTEGER REFERENCES "Supplier"("id"),
      "orderMultiple" INTEGER,
      "note" TEXT,
      "active" INTEGER NOT NULL DEFAULT 1,
      "createdAt" TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "UsageHistory" (
      "id" SERIAL PRIMARY KEY,
      "itemId" INTEGER NOT NULL REFERENCES "Item"("id"),
      "yearMonth" TEXT NOT NULL,
      "outboundQty" DOUBLE PRECISION NOT NULL,
      "source" TEXT NOT NULL DEFAULT 'imported',
      "createdAt" TEXT NOT NULL,
      UNIQUE("itemId", "yearMonth")
    )`,
    `CREATE TABLE IF NOT EXISTS "MonthlyRecord" (
      "id" SERIAL PRIMARY KEY,
      "itemId" INTEGER NOT NULL REFERENCES "Item"("id"),
      "yearMonth" TEXT NOT NULL,
      "staffId" TEXT NOT NULL REFERENCES "Staff"("id"),
      "incomingQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "actualCount" DOUBLE PRECISION,
      "previousStock" DOUBLE PRECISION,
      "expectedCount" DOUBLE PRECISION,
      "variance" DOUBLE PRECISION,
      "avgUsageUsed" DOUBLE PRECISION,
      "flagged" INTEGER NOT NULL DEFAULT 0,
      "isBaseline" INTEGER NOT NULL DEFAULT 0,
      "submittedAt" TEXT,
      "createdAt" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL,
      UNIQUE("itemId", "yearMonth")
    )`,
    `CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
      "id" SERIAL PRIMARY KEY,
      "itemId" INTEGER NOT NULL REFERENCES "Item"("id"),
      "targetYearMonth" TEXT NOT NULL,
      "orderedQty" DOUBLE PRECISION NOT NULL,
      "orderedAt" TEXT NOT NULL,
      "orderedBy" TEXT NOT NULL REFERENCES "Staff"("id"),
      "createdAt" TEXT NOT NULL,
      UNIQUE("itemId", "targetYearMonth")
    )`,
    `CREATE TABLE IF NOT EXISTS "Receipt" (
      "id" SERIAL PRIMARY KEY,
      "purchaseOrderId" INTEGER NOT NULL REFERENCES "PurchaseOrder"("id"),
      "receivedQty" DOUBLE PRECISION NOT NULL,
      "receivedDate" TEXT NOT NULL,
      "hasPackingSlip" INTEGER NOT NULL DEFAULT 0,
      "recordedBy" TEXT NOT NULL REFERENCES "Staff"("id"),
      "note" TEXT,
      "createdAt" TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "ChangeLog" (
      "id" SERIAL PRIMARY KEY,
      "entityType" TEXT NOT NULL,
      "entityKey" TEXT NOT NULL,
      "field" TEXT NOT NULL,
      "oldValue" DOUBLE PRECISION,
      "newValue" DOUBLE PRECISION NOT NULL,
      "changedBy" TEXT NOT NULL REFERENCES "Staff"("id"),
      "changedAt" TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "Lot" (
      "id" SERIAL PRIMARY KEY,
      "itemId" INTEGER NOT NULL REFERENCES "Item"("id"),
      "yearMonth" TEXT NOT NULL,
      "lotNumber" TEXT NOT NULL,
      "createdAt" TEXT NOT NULL,
      UNIQUE("itemId", "yearMonth", "lotNumber")
    )`,
    `CREATE TABLE IF NOT EXISTS "LotCount" (
      "id" SERIAL PRIMARY KEY,
      "lotId" INTEGER NOT NULL REFERENCES "Lot"("id"),
      "yearMonth" TEXT NOT NULL,
      "count" DOUBLE PRECISION NOT NULL,
      "recordedBy" TEXT NOT NULL REFERENCES "Staff"("id"),
      "submittedAt" TEXT NOT NULL,
      UNIQUE("lotId", "yearMonth")
    )`,
    `CREATE TABLE IF NOT EXISTS "AuditLog" (
      "id" SERIAL PRIMARY KEY,
      "actorId" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "detail" TEXT NOT NULL,
      "createdAt" TEXT NOT NULL
    )`,
  ];
  // Run every CREATE TABLE as one batched round trip (in order, inside a
  // transaction) instead of awaiting them one at a time — on a cold start
  // that was 12 sequential requests to the DB before any real query ran.
  await sql.transaction(statements.map((stmt) => sql.query(stmt)));
}

let readyPromise: Promise<void> | null = null;
const ready = new Promise<void>((resolve, reject) => {
  readyPromise = ensureSchema().then(resolve, reject);
});
void readyPromise;

function nowIso() {
  return new Date().toISOString();
}

function toStaff(row: Record<string, unknown> | undefined): StaffRow | null {
  if (!row) return null;
  return {
    id: row.id as string,
    name: row.name as string,
    passwordHash: row.passwordHash as string,
    role: row.role as Role,
    active: Boolean(row.active),
    createdAt: new Date(row.createdAt as string),
  };
}

function toItem(row: Record<string, unknown> | undefined): ItemRow | null {
  if (!row) return null;
  return {
    id: row.id as number,
    code: row.code as string,
    name: row.name as string,
    spec: (row.spec as string) ?? null,
    type: (row.type as string) ?? null,
    manufacturer: (row.manufacturer as string) ?? null,
    assigneeId: (row.assigneeId as string) ?? null,
    supplierId: (row.supplierId as number) ?? null,
    orderMultiple: (row.orderMultiple as number) ?? null,
    note: (row.note as string) ?? null,
    active: Boolean(row.active),
    createdAt: new Date(row.createdAt as string),
  };
}

function toSupplier(row: Record<string, unknown>): SupplierRow {
  return {
    id: row.id as number,
    name: row.name as string,
    color: (row.color as string) ?? null,
    contactName: (row.contactName as string) ?? null,
    contactPhone: (row.contactPhone as string) ?? null,
    createdAt: new Date(row.createdAt as string),
  };
}

function toUsage(row: Record<string, unknown>): UsageHistoryRow {
  return {
    id: row.id as number,
    itemId: row.itemId as number,
    yearMonth: row.yearMonth as string,
    outboundQty: row.outboundQty as number,
    source: row.source as string,
    createdAt: new Date(row.createdAt as string),
  };
}

function toPurchaseOrder(row: Record<string, unknown> | undefined): PurchaseOrderRow | null {
  if (!row) return null;
  return {
    id: row.id as number,
    itemId: row.itemId as number,
    targetYearMonth: row.targetYearMonth as string,
    orderedQty: row.orderedQty as number,
    orderedAt: row.orderedAt as string,
    orderedBy: row.orderedBy as string,
    createdAt: new Date(row.createdAt as string),
  };
}

function toReceipt(row: Record<string, unknown>): ReceiptRow {
  return {
    id: row.id as number,
    purchaseOrderId: row.purchaseOrderId as number,
    receivedQty: row.receivedQty as number,
    receivedDate: row.receivedDate as string,
    hasPackingSlip: Boolean(row.hasPackingSlip),
    recordedBy: row.recordedBy as string,
    note: (row.note as string) ?? null,
    createdAt: new Date(row.createdAt as string),
  };
}

function toLot(row: Record<string, unknown>): LotRow {
  return {
    id: row.id as number,
    itemId: row.itemId as number,
    yearMonth: row.yearMonth as string,
    lotNumber: row.lotNumber as string,
    createdAt: new Date(row.createdAt as string),
  };
}

function toLotCount(row: Record<string, unknown>): LotCountRow {
  return {
    id: row.id as number,
    lotId: row.lotId as number,
    yearMonth: row.yearMonth as string,
    count: row.count as number,
    recordedBy: row.recordedBy as string,
    submittedAt: new Date(row.submittedAt as string),
  };
}

function toChangeLog(row: Record<string, unknown>): ChangeLogRow {
  return {
    id: row.id as number,
    entityType: row.entityType as string,
    entityKey: row.entityKey as string,
    field: row.field as string,
    oldValue: (row.oldValue as number) ?? null,
    newValue: row.newValue as number,
    changedBy: row.changedBy as string,
    changedAt: new Date(row.changedAt as string),
  };
}

function toRecord(row: Record<string, unknown> | undefined): MonthlyRecordRow | null {
  if (!row) return null;
  return {
    id: row.id as number,
    itemId: row.itemId as number,
    yearMonth: row.yearMonth as string,
    staffId: row.staffId as string,
    incomingQty: row.incomingQty as number,
    actualCount: (row.actualCount as number) ?? null,
    previousStock: (row.previousStock as number) ?? null,
    expectedCount: (row.expectedCount as number) ?? null,
    variance: (row.variance as number) ?? null,
    avgUsageUsed: (row.avgUsageUsed as number) ?? null,
    flagged: Boolean(row.flagged),
    isBaseline: Boolean(row.isBaseline),
    submittedAt: row.submittedAt ? new Date(row.submittedAt as string) : null,
    createdAt: new Date(row.createdAt as string),
    updatedAt: new Date(row.updatedAt as string),
  };
}

export const db = {
  staff: {
    async findUnique({ where }: { where: { id: string } }): Promise<StaffRow | null> {
      const row = await q1('SELECT * FROM "Staff" WHERE "id" = $1', [where.id]);
      return toStaff(row);
    },
    async findMany(args: { orderBy?: { id: 'asc' | 'desc' } } = {}): Promise<StaffRow[]> {
      const dir = args.orderBy?.id === 'desc' ? 'DESC' : 'ASC';
      const rows = await q(`SELECT * FROM "Staff" ORDER BY "id" ${dir}`);
      return rows.map((r) => toStaff(r)!);
    },
    async create({ data }: { data: { id: string; name: string; role: Role; passwordHash: string } }): Promise<StaffRow> {
      await q(
        'INSERT INTO "Staff" ("id", "name", "role", "passwordHash", "active", "createdAt") VALUES ($1, $2, $3, $4, 1, $5)',
        [data.id, data.name, data.role, data.passwordHash, nowIso()],
      );
      return (await this.findUnique({ where: { id: data.id } }))!;
    },
    async upsert({
      where,
      update,
      create,
    }: {
      where: { id: string };
      update: { name: string; role: Role };
      create: { id: string; name: string; role: Role; passwordHash: string };
    }): Promise<StaffRow> {
      const existing = await this.findUnique({ where });
      if (existing) {
        await q('UPDATE "Staff" SET "name" = $1, "role" = $2 WHERE "id" = $3', [update.name, update.role, where.id]);
        return (await this.findUnique({ where }))!;
      }
      return this.create({ data: create });
    },
    async update({ where, data }: { where: { id: string }; data: { role: Role } }): Promise<StaffRow> {
      await q('UPDATE "Staff" SET "role" = $1 WHERE "id" = $2', [data.role, where.id]);
      return (await this.findUnique({ where }))!;
    },
  },

  item: {
    async findUnique({ where }: { where: { id?: number; code?: string } }): Promise<ItemRow | null> {
      if (where.id != null) {
        const row = await q1('SELECT * FROM "Item" WHERE "id" = $1', [where.id]);
        return toItem(row);
      }
      const row = await q1('SELECT * FROM "Item" WHERE "code" = $1', [where.code!]);
      return toItem(row);
    },
    async findMany(args: {
      where?: { assigneeId?: string; active?: boolean };
      orderBy?: { code: 'asc' | 'desc' };
      include?: { assignee?: boolean; supplier?: boolean };
    } = {}): Promise<ItemRow[]> {
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (args.where?.assigneeId !== undefined) {
        params.push(args.where.assigneeId);
        clauses.push(`"assigneeId" = $${params.length}`);
      }
      if (args.where?.active !== undefined) {
        params.push(args.where.active ? 1 : 0);
        clauses.push(`"active" = $${params.length}`);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const dir = args.orderBy?.code === 'desc' ? 'DESC' : 'ASC';
      const rows = await q(`SELECT * FROM "Item" ${where} ORDER BY "code" ${dir}`, params);
      const items = rows.map((r) => toItem(r)!);
      // Batch-fetch related staff/suppliers in one round trip each instead of
      // one findUnique per item — with ~140 items that was ~280 sequential
      // round trips (the main cause of the admin screen's 10-15s load time).
      if (args.include?.assignee) {
        const ids = [...new Set(items.map((i) => i.assigneeId).filter((id): id is string => id != null))];
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
        const staffById = new Map(
          ids.length
            ? (await q<Record<string, unknown>>(`SELECT * FROM "Staff" WHERE "id" IN (${placeholders})`, ids)).map((r) => [
                r.id as string,
                toStaff(r)!,
              ])
            : [],
        );
        for (const item of items) {
          item.assignee = item.assigneeId ? (staffById.get(item.assigneeId) ?? null) : null;
        }
      }
      if (args.include?.supplier) {
        const ids = [...new Set(items.map((i) => i.supplierId).filter((id): id is number => id != null))];
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
        const supplierById = new Map(
          ids.length
            ? (await q<Record<string, unknown>>(`SELECT * FROM "Supplier" WHERE "id" IN (${placeholders})`, ids)).map((r) => [
                r.id as number,
                toSupplier(r),
              ])
            : [],
        );
        for (const item of items) {
          item.supplier = item.supplierId ? (supplierById.get(item.supplierId) ?? null) : null;
        }
      }
      return items;
    },
    async create({
      data,
    }: {
      data: {
        code: string;
        name: string;
        spec?: string | null;
        type?: string | null;
        manufacturer?: string | null;
        assigneeId?: string | null;
        supplierId?: number | null;
        orderMultiple?: number | null;
        note?: string | null;
      };
    }): Promise<ItemRow> {
      await q(
        `INSERT INTO "Item" ("code", "name", "spec", "type", "manufacturer", "assigneeId", "supplierId", "orderMultiple", "note", "active", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10)`,
        [
          data.code,
          data.name,
          data.spec ?? null,
          data.type ?? null,
          data.manufacturer ?? null,
          data.assigneeId ?? null,
          data.supplierId ?? null,
          data.orderMultiple ?? null,
          data.note ?? null,
          nowIso(),
        ],
      );
      return (await this.findUnique({ where: { code: data.code } }))!;
    },
    async update({
      where,
      data,
    }: {
      where: { id: number };
      data: {
        assigneeId?: string | null;
        supplierId?: number | null;
        orderMultiple?: number | null;
        note?: string | null;
        active?: boolean;
      };
    }): Promise<ItemRow> {
      if (data.assigneeId !== undefined) {
        await q('UPDATE "Item" SET "assigneeId" = $1 WHERE "id" = $2', [data.assigneeId, where.id]);
      }
      if (data.orderMultiple !== undefined) {
        await q('UPDATE "Item" SET "orderMultiple" = $1 WHERE "id" = $2', [data.orderMultiple, where.id]);
      }
      if (data.note !== undefined) {
        await q('UPDATE "Item" SET "note" = $1 WHERE "id" = $2', [data.note, where.id]);
      }
      if (data.supplierId !== undefined) {
        await q('UPDATE "Item" SET "supplierId" = $1 WHERE "id" = $2', [data.supplierId, where.id]);
      }
      if (data.active !== undefined) {
        await q('UPDATE "Item" SET "active" = $1 WHERE "id" = $2', [data.active ? 1 : 0, where.id]);
      }
      return (await this.findUnique({ where: { id: where.id } }))!;
    },
    async remove(id: number): Promise<{ ok: true } | { ok: false; reason: string }> {
      const [{ c: recordCount }] = await q<{ c: number }>('SELECT COUNT(*)::int c FROM "MonthlyRecord" WHERE "itemId" = $1', [id]);
      const [{ c: orderCount }] = await q<{ c: number }>('SELECT COUNT(*)::int c FROM "PurchaseOrder" WHERE "itemId" = $1', [id]);
      const [{ c: usageCount }] = await q<{ c: number }>('SELECT COUNT(*)::int c FROM "UsageHistory" WHERE "itemId" = $1', [id]);
      if (recordCount > 0 || orderCount > 0 || usageCount > 0) {
        return { ok: false, reason: '실사·발주·출고 이력이 있어 완전히 삭제할 수 없습니다. 대신 비활성화해주세요.' };
      }
      await q('DELETE FROM "Item" WHERE "id" = $1', [id]);
      return { ok: true };
    },
    async upsert({
      where,
      update,
      create,
    }: {
      where: { code: string };
      update: {
        name: string;
        spec: string | null;
        type: string | null;
        manufacturer: string | null;
        assigneeId: string | null;
      };
      create: {
        code: string;
        name: string;
        spec: string | null;
        type: string | null;
        manufacturer: string | null;
        assigneeId: string | null;
      };
    }): Promise<ItemRow> {
      const existing = await this.findUnique({ where: { code: where.code } });
      if (existing) {
        await q(
          'UPDATE "Item" SET "name" = $1, "spec" = $2, "type" = $3, "manufacturer" = $4, "assigneeId" = $5 WHERE "code" = $6',
          [update.name, update.spec, update.type, update.manufacturer, update.assigneeId, where.code],
        );
        return (await this.findUnique({ where: { code: where.code } }))!;
      }
      return this.create({ data: create });
    },
  },

  supplier: {
    async findUnique({ where }: { where: { id: number } }): Promise<SupplierRow | null> {
      const row = await q1('SELECT * FROM "Supplier" WHERE "id" = $1', [where.id]);
      return row ? toSupplier(row) : null;
    },
    async findMany(args: { orderBy?: { name: 'asc' | 'desc' } } = {}): Promise<SupplierRow[]> {
      const dir = args.orderBy?.name === 'desc' ? 'DESC' : 'ASC';
      const rows = await q(`SELECT * FROM "Supplier" ORDER BY "name" ${dir}`);
      return rows.map(toSupplier);
    },
    async create({
      data,
    }: {
      data: { name: string; color?: string | null; contactName?: string | null; contactPhone?: string | null };
    }): Promise<SupplierRow> {
      const row = await q1(
        'INSERT INTO "Supplier" ("name", "color", "contactName", "contactPhone", "createdAt") VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [data.name, data.color ?? null, data.contactName ?? null, data.contactPhone ?? null, nowIso()],
      );
      return toSupplier(row!);
    },
    async update({
      where,
      data,
    }: {
      where: { id: number };
      data: { name?: string; color?: string | null; contactName?: string | null; contactPhone?: string | null };
    }): Promise<SupplierRow> {
      if (data.name !== undefined) await q('UPDATE "Supplier" SET "name" = $1 WHERE "id" = $2', [data.name, where.id]);
      if (data.color !== undefined)
        await q('UPDATE "Supplier" SET "color" = $1 WHERE "id" = $2', [data.color, where.id]);
      if (data.contactName !== undefined)
        await q('UPDATE "Supplier" SET "contactName" = $1 WHERE "id" = $2', [data.contactName, where.id]);
      if (data.contactPhone !== undefined)
        await q('UPDATE "Supplier" SET "contactPhone" = $1 WHERE "id" = $2', [data.contactPhone, where.id]);
      return (await this.findUnique({ where }))!;
    },
  },

  lot: {
    async findUnique({
      where,
    }: {
      where: { itemId_yearMonth_lotNumber: { itemId: number; yearMonth: string; lotNumber: string } };
    }): Promise<LotRow | null> {
      const { itemId, yearMonth, lotNumber } = where.itemId_yearMonth_lotNumber;
      const row = await q1('SELECT * FROM "Lot" WHERE "itemId" = $1 AND "yearMonth" = $2 AND "lotNumber" = $3', [
        itemId,
        yearMonth,
        lotNumber,
      ]);
      return row ? toLot(row) : null;
    },
    async findMany({ where }: { where?: { itemId?: number; yearMonth?: string } } = {}): Promise<LotRow[]> {
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (where?.itemId !== undefined) {
        params.push(where.itemId);
        clauses.push(`"itemId" = $${params.length}`);
      }
      if (where?.yearMonth !== undefined) {
        params.push(where.yearMonth);
        clauses.push(`"yearMonth" = $${params.length}`);
      }
      const clause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = await q(`SELECT * FROM "Lot" ${clause} ORDER BY "lotNumber" ASC`, params);
      return rows.map(toLot);
    },
    async create({ data }: { data: { itemId: number; yearMonth: string; lotNumber: string } }): Promise<LotRow> {
      await q('INSERT INTO "Lot" ("itemId", "yearMonth", "lotNumber", "createdAt") VALUES ($1, $2, $3, $4)', [
        data.itemId,
        data.yearMonth,
        data.lotNumber,
        nowIso(),
      ]);
      return (await this.findUnique({ where: { itemId_yearMonth_lotNumber: data } }))!;
    },
    async delete({ where }: { where: { id: number } }): Promise<void> {
      await q('DELETE FROM "LotCount" WHERE "lotId" = $1', [where.id]);
      await q('DELETE FROM "Lot" WHERE "id" = $1', [where.id]);
    },
  },

  lotCount: {
    async findMany({ where }: { where: { lotId: { in: number[] }; yearMonth: string } }): Promise<LotCountRow[]> {
      if (where.lotId.in.length === 0) return [];
      const placeholders = where.lotId.in.map((_, i) => `$${i + 2}`).join(',');
      const rows = await q(`SELECT * FROM "LotCount" WHERE "yearMonth" = $1 AND "lotId" IN (${placeholders})`, [
        where.yearMonth,
        ...where.lotId.in,
      ]);
      return rows.map(toLotCount);
    },
    async upsert({
      where,
      data,
    }: {
      where: { lotId_yearMonth: { lotId: number; yearMonth: string } };
      data: { count: number; recordedBy: string };
    }): Promise<LotCountRow> {
      const { lotId, yearMonth } = where.lotId_yearMonth;
      await q(
        `INSERT INTO "LotCount" ("lotId", "yearMonth", "count", "recordedBy", "submittedAt")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("lotId", "yearMonth") DO UPDATE SET "count" = EXCLUDED."count", "recordedBy" = EXCLUDED."recordedBy", "submittedAt" = EXCLUDED."submittedAt"`,
        [lotId, yearMonth, data.count, data.recordedBy, nowIso()],
      );
      const row = await q1('SELECT * FROM "LotCount" WHERE "lotId" = $1 AND "yearMonth" = $2', [lotId, yearMonth]);
      return toLotCount(row!);
    },
  },

  usageHistory: {
    async findMany({ where }: { where: { itemId: number; yearMonth: { in: string[] } } }): Promise<UsageHistoryRow[]> {
      if (where.yearMonth.in.length === 0) return [];
      const placeholders = where.yearMonth.in.map((_, i) => `$${i + 2}`).join(',');
      const rows = await q(`SELECT * FROM "UsageHistory" WHERE "itemId" = $1 AND "yearMonth" IN (${placeholders})`, [
        where.itemId,
        ...where.yearMonth.in,
      ]);
      return rows.map(toUsage);
    },
    async upsert({
      where,
      update,
    }: {
      where: { itemId_yearMonth: { itemId: number; yearMonth: string } };
      update: { outboundQty: number; source: string };
      create: { itemId: number; yearMonth: string; outboundQty: number; source: string };
    }): Promise<void> {
      const { itemId, yearMonth } = where.itemId_yearMonth;
      await q(
        `INSERT INTO "UsageHistory" ("itemId", "yearMonth", "outboundQty", "source", "createdAt")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("itemId", "yearMonth") DO UPDATE SET "outboundQty" = EXCLUDED."outboundQty", "source" = EXCLUDED."source"`,
        [itemId, yearMonth, update.outboundQty, update.source, nowIso()],
      );
    },
  },

  monthlyRecord: {
    async findUnique({
      where,
    }: {
      where: { itemId_yearMonth: { itemId: number; yearMonth: string } };
    }): Promise<MonthlyRecordRow | null> {
      const { itemId, yearMonth } = where.itemId_yearMonth;
      const row = await q1('SELECT * FROM "MonthlyRecord" WHERE "itemId" = $1 AND "yearMonth" = $2', [
        itemId,
        yearMonth,
      ]);
      return toRecord(row);
    },
    async findMany({ where }: { where: { yearMonth: string; itemId: { in: number[] } } }): Promise<MonthlyRecordRow[]> {
      if (where.itemId.in.length === 0) return [];
      const placeholders = where.itemId.in.map((_, i) => `$${i + 2}`).join(',');
      const rows = await q(`SELECT * FROM "MonthlyRecord" WHERE "yearMonth" = $1 AND "itemId" IN (${placeholders})`, [
        where.yearMonth,
        ...where.itemId.in,
      ]);
      return rows.map((r) => toRecord(r)!);
    },
    async upsert({
      where,
      create,
    }: {
      where: { itemId_yearMonth: { itemId: number; yearMonth: string } };
      update: {
        staffId: string;
        incomingQty: number;
        actualCount: number;
        previousStock: number | null;
        expectedCount: number | null;
        avgUsageUsed: number | null;
        variance: number | null;
        flagged: boolean;
        isBaseline: boolean;
        submittedAt: Date;
      };
      create: {
        itemId: number;
        yearMonth: string;
        staffId: string;
        incomingQty: number;
        actualCount: number;
        previousStock: number | null;
        expectedCount: number | null;
        avgUsageUsed: number | null;
        variance: number | null;
        flagged: boolean;
        isBaseline: boolean;
        submittedAt: Date;
      };
    }): Promise<MonthlyRecordRow> {
      const { itemId, yearMonth } = where.itemId_yearMonth;
      const now = nowIso();
      await q(
        `INSERT INTO "MonthlyRecord"
           ("itemId", "yearMonth", "staffId", "incomingQty", "actualCount", "previousStock", "expectedCount", "avgUsageUsed", "variance", "flagged", "isBaseline", "submittedAt", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT ("itemId", "yearMonth") DO UPDATE SET
           "staffId" = EXCLUDED."staffId",
           "incomingQty" = EXCLUDED."incomingQty",
           "actualCount" = EXCLUDED."actualCount",
           "previousStock" = EXCLUDED."previousStock",
           "expectedCount" = EXCLUDED."expectedCount",
           "avgUsageUsed" = EXCLUDED."avgUsageUsed",
           "variance" = EXCLUDED."variance",
           "flagged" = EXCLUDED."flagged",
           "isBaseline" = EXCLUDED."isBaseline",
           "submittedAt" = EXCLUDED."submittedAt",
           "updatedAt" = EXCLUDED."updatedAt"`,
        [
          itemId,
          yearMonth,
          create.staffId,
          create.incomingQty,
          create.actualCount,
          create.previousStock,
          create.expectedCount,
          create.avgUsageUsed,
          create.variance,
          create.flagged ? 1 : 0,
          create.isBaseline ? 1 : 0,
          create.submittedAt.toISOString(),
          now,
          now,
        ],
      );
      return (await this.findUnique({ where }))!;
    },
  },

  purchaseOrder: {
    async findUnique({
      where,
    }: {
      where: { itemId_targetYearMonth: { itemId: number; targetYearMonth: string } };
    }): Promise<PurchaseOrderRow | null> {
      const { itemId, targetYearMonth } = where.itemId_targetYearMonth;
      const row = await q1('SELECT * FROM "PurchaseOrder" WHERE "itemId" = $1 AND "targetYearMonth" = $2', [
        itemId,
        targetYearMonth,
      ]);
      return toPurchaseOrder(row);
    },
    async findMany({
      where,
    }: {
      where: { targetYearMonth: string; itemId?: { in: number[] } };
    }): Promise<PurchaseOrderRow[]> {
      if (where.itemId && where.itemId.in.length === 0) return [];
      if (where.itemId) {
        const placeholders = where.itemId.in.map((_, i) => `$${i + 2}`).join(',');
        const rows = await q(
          `SELECT * FROM "PurchaseOrder" WHERE "targetYearMonth" = $1 AND "itemId" IN (${placeholders})`,
          [where.targetYearMonth, ...where.itemId.in],
        );
        return rows.map((r) => toPurchaseOrder(r)!);
      }
      const rows = await q('SELECT * FROM "PurchaseOrder" WHERE "targetYearMonth" = $1', [where.targetYearMonth]);
      return rows.map((r) => toPurchaseOrder(r)!);
    },
    async upsert({
      where,
      update,
      create,
    }: {
      where: { itemId_targetYearMonth: { itemId: number; targetYearMonth: string } };
      update: { orderedQty: number; orderedBy: string };
      create: { itemId: number; targetYearMonth: string; orderedQty: number; orderedAt: string; orderedBy: string };
    }): Promise<PurchaseOrderRow> {
      const { itemId, targetYearMonth } = where.itemId_targetYearMonth;
      const existing = await this.findUnique({ where });
      if (existing) {
        await q('UPDATE "PurchaseOrder" SET "orderedQty" = $1, "orderedBy" = $2 WHERE "itemId" = $3 AND "targetYearMonth" = $4', [
          update.orderedQty,
          update.orderedBy,
          itemId,
          targetYearMonth,
        ]);
        return (await this.findUnique({ where }))!;
      }
      await q(
        `INSERT INTO "PurchaseOrder" ("itemId", "targetYearMonth", "orderedQty", "orderedAt", "orderedBy", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [itemId, targetYearMonth, create.orderedQty, create.orderedAt, create.orderedBy, nowIso()],
      );
      return (await this.findUnique({ where }))!;
    },
    async delete({ where }: { where: { id: number } }): Promise<void> {
      await q('DELETE FROM "PurchaseOrder" WHERE "id" = $1', [where.id]);
    },
  },

  receipt: {
    async findUnique({ where }: { where: { id: number } }): Promise<ReceiptRow | null> {
      const row = await q1('SELECT * FROM "Receipt" WHERE "id" = $1', [where.id]);
      return row ? toReceipt(row) : null;
    },
    async findMany({ where }: { where: { purchaseOrderId: { in: number[] } } }): Promise<ReceiptRow[]> {
      if (where.purchaseOrderId.in.length === 0) return [];
      const placeholders = where.purchaseOrderId.in.map((_, i) => `$${i + 1}`).join(',');
      const rows = await q(
        `SELECT * FROM "Receipt" WHERE "purchaseOrderId" IN (${placeholders}) ORDER BY "receivedDate" ASC, "id" ASC`,
        where.purchaseOrderId.in,
      );
      return rows.map(toReceipt);
    },
    async create({
      data,
    }: {
      data: {
        purchaseOrderId: number;
        receivedQty: number;
        receivedDate: string;
        hasPackingSlip: boolean;
        recordedBy: string;
        note?: string | null;
      };
    }): Promise<ReceiptRow> {
      const row = await q1(
        `INSERT INTO "Receipt" ("purchaseOrderId", "receivedQty", "receivedDate", "hasPackingSlip", "recordedBy", "note", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          data.purchaseOrderId,
          data.receivedQty,
          data.receivedDate,
          data.hasPackingSlip ? 1 : 0,
          data.recordedBy,
          data.note ?? null,
          nowIso(),
        ],
      );
      return toReceipt(row!);
    },
    async update({
      where,
      data,
    }: {
      where: { id: number };
      data: { receivedQty?: number; receivedDate?: string; hasPackingSlip?: boolean; note?: string | null };
    }): Promise<ReceiptRow> {
      if (data.receivedQty !== undefined) {
        await q('UPDATE "Receipt" SET "receivedQty" = $1 WHERE "id" = $2', [data.receivedQty, where.id]);
      }
      if (data.receivedDate !== undefined) {
        await q('UPDATE "Receipt" SET "receivedDate" = $1 WHERE "id" = $2', [data.receivedDate, where.id]);
      }
      if (data.hasPackingSlip !== undefined) {
        await q('UPDATE "Receipt" SET "hasPackingSlip" = $1 WHERE "id" = $2', [data.hasPackingSlip ? 1 : 0, where.id]);
      }
      if (data.note !== undefined) {
        await q('UPDATE "Receipt" SET "note" = $1 WHERE "id" = $2', [data.note, where.id]);
      }
      return (await this.findUnique({ where }))!;
    },
    async delete({ where }: { where: { id: number } }): Promise<void> {
      await q('DELETE FROM "Receipt" WHERE "id" = $1', [where.id]);
    },
  },

  changeLog: {
    async create({
      data,
    }: {
      data: {
        entityType: string;
        entityKey: string;
        field: string;
        oldValue: number | null;
        newValue: number;
        changedBy: string;
      };
    }): Promise<void> {
      await q(
        `INSERT INTO "ChangeLog" ("entityType", "entityKey", "field", "oldValue", "newValue", "changedBy", "changedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [data.entityType, data.entityKey, data.field, data.oldValue, data.newValue, data.changedBy, nowIso()],
      );
    },
    async findByType(entityType: string): Promise<ChangeLogRow[]> {
      const rows = await q('SELECT * FROM "ChangeLog" WHERE "entityType" = $1 ORDER BY "id" ASC', [entityType]);
      return rows.map(toChangeLog);
    },
  },

  auditLog: {
    async create({ data }: { data: { actorId: string; action: string; detail: string } }): Promise<void> {
      await q('INSERT INTO "AuditLog" ("actorId", "action", "detail", "createdAt") VALUES ($1, $2, $3, $4)', [
        data.actorId,
        data.action,
        data.detail,
        nowIso(),
      ]);
    },
  },
};
