import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

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

const DB_PATH = process.env.SQLITE_PATH ?? path.join(process.cwd(), 'db', 'dev.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const globalForDb = globalThis as unknown as { sqliteDb?: DatabaseSync };
const raw = globalForDb.sqliteDb ?? new DatabaseSync(DB_PATH);
if (process.env.NODE_ENV !== 'production') globalForDb.sqliteDb = raw;

raw.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS Staff (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'STAFF',
    active INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS Item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    spec TEXT,
    type TEXT,
    manufacturer TEXT,
    assigneeId TEXT REFERENCES Staff(id),
    active INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS Supplier (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS UsageHistory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    itemId INTEGER NOT NULL REFERENCES Item(id),
    yearMonth TEXT NOT NULL,
    outboundQty REAL NOT NULL,
    source TEXT NOT NULL DEFAULT 'imported',
    createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(itemId, yearMonth)
  );

  CREATE TABLE IF NOT EXISTS MonthlyRecord (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    itemId INTEGER NOT NULL REFERENCES Item(id),
    yearMonth TEXT NOT NULL,
    staffId TEXT NOT NULL REFERENCES Staff(id),
    incomingQty REAL NOT NULL DEFAULT 0,
    actualCount REAL,
    previousStock REAL,
    expectedCount REAL,
    variance REAL,
    avgUsageUsed REAL,
    flagged INTEGER NOT NULL DEFAULT 0,
    isBaseline INTEGER NOT NULL DEFAULT 0,
    submittedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(itemId, yearMonth)
  );

  CREATE TABLE IF NOT EXISTS PurchaseOrder (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    itemId INTEGER NOT NULL REFERENCES Item(id),
    targetYearMonth TEXT NOT NULL,
    orderedQty REAL NOT NULL,
    orderedAt TEXT NOT NULL,
    orderedBy TEXT NOT NULL REFERENCES Staff(id),
    createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(itemId, targetYearMonth)
  );

  CREATE TABLE IF NOT EXISTS Receipt (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchaseOrderId INTEGER NOT NULL REFERENCES PurchaseOrder(id),
    receivedQty REAL NOT NULL,
    receivedDate TEXT NOT NULL,
    hasPackingSlip INTEGER NOT NULL DEFAULT 0,
    recordedBy TEXT NOT NULL REFERENCES Staff(id),
    note TEXT,
    createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS ChangeLog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entityType TEXT NOT NULL,
    entityKey TEXT NOT NULL,
    field TEXT NOT NULL,
    oldValue REAL,
    newValue REAL NOT NULL,
    changedBy TEXT NOT NULL REFERENCES Staff(id),
    changedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS Lot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    itemId INTEGER NOT NULL REFERENCES Item(id),
    yearMonth TEXT NOT NULL,
    lotNumber TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(itemId, yearMonth, lotNumber)
  );

  CREATE TABLE IF NOT EXISTS LotCount (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lotId INTEGER NOT NULL REFERENCES Lot(id),
    yearMonth TEXT NOT NULL,
    count REAL NOT NULL,
    recordedBy TEXT NOT NULL REFERENCES Staff(id),
    submittedAt TEXT NOT NULL,
    UNIQUE(lotId, yearMonth)
  );

  CREATE TABLE IF NOT EXISTS AuditLog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actorId TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
`);

// Item existed before Supplier was introduced — add the column if this DB predates it.
{
  const itemColumns = raw.prepare('PRAGMA table_info(Item)').all() as Record<string, unknown>[];
  const hasSupplierId = itemColumns.some((c) => c.name === 'supplierId');
  if (!hasSupplierId) {
    raw.exec('ALTER TABLE Item ADD COLUMN supplierId INTEGER REFERENCES Supplier(id)');
  }
}

// Supplier existed before color/contact fields were introduced — add them if this DB predates it.
{
  const supplierColumns = raw.prepare('PRAGMA table_info(Supplier)').all() as Record<string, unknown>[];
  const existingNames = new Set(supplierColumns.map((c) => c.name as string));
  if (!existingNames.has('color')) raw.exec('ALTER TABLE Supplier ADD COLUMN color TEXT');
  if (!existingNames.has('contactName')) raw.exec('ALTER TABLE Supplier ADD COLUMN contactName TEXT');
  if (!existingNames.has('contactPhone')) raw.exec('ALTER TABLE Supplier ADD COLUMN contactPhone TEXT');
}

// Item existed before orderMultiple was introduced — add it if this DB predates it.
{
  const itemColumns2 = raw.prepare('PRAGMA table_info(Item)').all() as Record<string, unknown>[];
  const hasOrderMultiple = itemColumns2.some((c) => c.name === 'orderMultiple');
  if (!hasOrderMultiple) raw.exec('ALTER TABLE Item ADD COLUMN orderMultiple INTEGER');
}

// Item existed before note was introduced — add it if this DB predates it.
{
  const itemColumns3 = raw.prepare('PRAGMA table_info(Item)').all() as Record<string, unknown>[];
  const hasNote = itemColumns3.some((c) => c.name === 'note');
  if (!hasNote) raw.exec('ALTER TABLE Item ADD COLUMN note TEXT');
}

// Lot originally had a global "active" flag instead of being scoped per month — migrate any
// still-active lots forward into the current month so nothing already pasted in is lost.
{
  const lotColumns = raw.prepare('PRAGMA table_info(Lot)').all() as Record<string, unknown>[];
  const hasYearMonth = lotColumns.some((c) => c.name === 'yearMonth');
  if (!hasYearMonth) {
    raw.exec('ALTER TABLE Lot RENAME TO Lot_old_pre_month_scope');
    raw.exec(`
      CREATE TABLE Lot (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        itemId INTEGER NOT NULL REFERENCES Item(id),
        yearMonth TEXT NOT NULL,
        lotNumber TEXT NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        UNIQUE(itemId, yearMonth, lotNumber)
      );
    `);
    const now = new Date();
    const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const oldLots = raw.prepare('SELECT * FROM Lot_old_pre_month_scope WHERE active = 1').all() as Record<
      string,
      unknown
    >[];
    for (const l of oldLots) {
      raw
        .prepare('INSERT OR IGNORE INTO Lot (id, itemId, yearMonth, lotNumber, createdAt) VALUES (?, ?, ?, ?, ?)')
        .run(l.id, l.itemId, currentYm, l.lotNumber, l.createdAt);
    }
    raw.exec('DROP TABLE Lot_old_pre_month_scope');
  }
}

// SQLite auto-rewrites foreign key text in other tables when their parent is renamed, so the
// "ALTER TABLE Lot RENAME TO Lot_old_pre_month_scope" step above silently repointed LotCount's
// FK at that transient name — which was then dropped, leaving LotCount referencing a table that
// no longer exists. Rebuild LotCount pointing at the real "Lot" table if this happened.
{
  const lotCountSql = raw
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='LotCount'")
    .get() as { sql: string } | undefined;
  if (lotCountSql && lotCountSql.sql.includes('Lot_old_pre_month_scope')) {
    raw.exec('ALTER TABLE LotCount RENAME TO LotCount_fk_fix_old');
    raw.exec(`
      CREATE TABLE LotCount (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lotId INTEGER NOT NULL REFERENCES Lot(id),
        yearMonth TEXT NOT NULL,
        count REAL NOT NULL,
        recordedBy TEXT NOT NULL REFERENCES Staff(id),
        submittedAt TEXT NOT NULL,
        UNIQUE(lotId, yearMonth)
      );
    `);
    raw.exec(
      'INSERT INTO LotCount (id, lotId, yearMonth, count, recordedBy, submittedAt) SELECT id, lotId, yearMonth, count, recordedBy, submittedAt FROM LotCount_fk_fix_old',
    );
    raw.exec('DROP TABLE LotCount_fk_fix_old');
  }
}

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
    findUnique({ where }: { where: { id: string } }): StaffRow | null {
      const row = raw.prepare('SELECT * FROM Staff WHERE id = ?').get(where.id) as
        | Record<string, unknown>
        | undefined;
      return toStaff(row);
    },
    findMany(args: { orderBy?: { id: 'asc' | 'desc' } } = {}): StaffRow[] {
      const dir = args.orderBy?.id === 'desc' ? 'DESC' : 'ASC';
      const rows = raw.prepare(`SELECT * FROM Staff ORDER BY id ${dir}`).all() as Record<string, unknown>[];
      return rows.map((r) => toStaff(r)!);
    },
    create({ data }: { data: { id: string; name: string; role: Role; passwordHash: string } }): StaffRow {
      raw
        .prepare('INSERT INTO Staff (id, name, role, passwordHash, active, createdAt) VALUES (?, ?, ?, ?, 1, ?)')
        .run(data.id, data.name, data.role, data.passwordHash, nowIso());
      return this.findUnique({ where: { id: data.id } })!;
    },
    upsert({
      where,
      update,
      create,
    }: {
      where: { id: string };
      update: { name: string; role: Role };
      create: { id: string; name: string; role: Role; passwordHash: string };
    }): StaffRow {
      const existing = this.findUnique({ where });
      if (existing) {
        raw.prepare('UPDATE Staff SET name = ?, role = ? WHERE id = ?').run(update.name, update.role, where.id);
        return this.findUnique({ where })!;
      }
      return this.create({ data: create });
    },
  },

  item: {
    findUnique({ where }: { where: { id?: number; code?: string } }): ItemRow | null {
      if (where.id != null) {
        const row = raw.prepare('SELECT * FROM Item WHERE id = ?').get(where.id) as
          | Record<string, unknown>
          | undefined;
        return toItem(row);
      }
      const row = raw.prepare('SELECT * FROM Item WHERE code = ?').get(where.code!) as
        | Record<string, unknown>
        | undefined;
      return toItem(row);
    },
    findMany(args: {
      where?: { assigneeId?: string; active?: boolean };
      orderBy?: { code: 'asc' | 'desc' };
      include?: { assignee?: boolean; supplier?: boolean };
    } = {}): ItemRow[] {
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (args.where?.assigneeId !== undefined) {
        clauses.push('assigneeId = ?');
        params.push(args.where.assigneeId);
      }
      if (args.where?.active !== undefined) {
        clauses.push('active = ?');
        params.push(args.where.active ? 1 : 0);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const dir = args.orderBy?.code === 'desc' ? 'DESC' : 'ASC';
      const rows = raw.prepare(`SELECT * FROM Item ${where} ORDER BY code ${dir}`).all(...params) as Record<
        string,
        unknown
      >[];
      const items = rows.map((r) => toItem(r)!);
      if (args.include?.assignee) {
        for (const item of items) {
          item.assignee = item.assigneeId ? db.staff.findUnique({ where: { id: item.assigneeId } }) : null;
        }
      }
      if (args.include?.supplier) {
        for (const item of items) {
          item.supplier = item.supplierId ? db.supplier.findUnique({ where: { id: item.supplierId } }) : null;
        }
      }
      return items;
    },
    create({
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
    }): ItemRow {
      raw
        .prepare(
          `INSERT INTO Item (code, name, spec, type, manufacturer, assigneeId, supplierId, orderMultiple, note, active, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        )
        .run(
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
        );
      return this.findUnique({ where: { code: data.code } })!;
    },
    update({
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
    }): ItemRow {
      if (data.assigneeId !== undefined) {
        raw.prepare('UPDATE Item SET assigneeId = ? WHERE id = ?').run(data.assigneeId, where.id);
      }
      if (data.orderMultiple !== undefined) {
        raw.prepare('UPDATE Item SET orderMultiple = ? WHERE id = ?').run(data.orderMultiple, where.id);
      }
      if (data.note !== undefined) {
        raw.prepare('UPDATE Item SET note = ? WHERE id = ?').run(data.note, where.id);
      }
      if (data.supplierId !== undefined) {
        raw.prepare('UPDATE Item SET supplierId = ? WHERE id = ?').run(data.supplierId, where.id);
      }
      if (data.active !== undefined) {
        raw.prepare('UPDATE Item SET active = ? WHERE id = ?').run(data.active ? 1 : 0, where.id);
      }
      return this.findUnique({ where: { id: where.id } })!;
    },
    remove(id: number): { ok: true } | { ok: false; reason: string } {
      const hasRecords = (raw.prepare('SELECT COUNT(*) c FROM MonthlyRecord WHERE itemId = ?').get(id) as { c: number })
        .c;
      const hasOrders = (raw.prepare('SELECT COUNT(*) c FROM PurchaseOrder WHERE itemId = ?').get(id) as { c: number })
        .c;
      const hasUsage = (raw.prepare('SELECT COUNT(*) c FROM UsageHistory WHERE itemId = ?').get(id) as { c: number })
        .c;
      if (hasRecords > 0 || hasOrders > 0 || hasUsage > 0) {
        return { ok: false, reason: '실사·발주·출고 이력이 있어 완전히 삭제할 수 없습니다. 대신 비활성화해주세요.' };
      }
      raw.prepare('DELETE FROM Item WHERE id = ?').run(id);
      return { ok: true };
    },
    upsert({
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
    }): ItemRow {
      const existing = this.findUnique({ where: { code: where.code } });
      if (existing) {
        raw
          .prepare('UPDATE Item SET name = ?, spec = ?, type = ?, manufacturer = ?, assigneeId = ? WHERE code = ?')
          .run(update.name, update.spec, update.type, update.manufacturer, update.assigneeId, where.code);
        return this.findUnique({ where: { code: where.code } })!;
      }
      return this.create({ data: create });
    },
  },

  supplier: {
    findUnique({ where }: { where: { id: number } }): SupplierRow | null {
      const row = raw.prepare('SELECT * FROM Supplier WHERE id = ?').get(where.id) as
        | Record<string, unknown>
        | undefined;
      return row ? toSupplier(row) : null;
    },
    findMany(args: { orderBy?: { name: 'asc' | 'desc' } } = {}): SupplierRow[] {
      const dir = args.orderBy?.name === 'desc' ? 'DESC' : 'ASC';
      const rows = raw.prepare(`SELECT * FROM Supplier ORDER BY name ${dir}`).all() as Record<string, unknown>[];
      return rows.map(toSupplier);
    },
    create({
      data,
    }: {
      data: { name: string; color?: string | null; contactName?: string | null; contactPhone?: string | null };
    }): SupplierRow {
      raw
        .prepare('INSERT INTO Supplier (name, color, contactName, contactPhone, createdAt) VALUES (?, ?, ?, ?, ?)')
        .run(data.name, data.color ?? null, data.contactName ?? null, data.contactPhone ?? null, nowIso());
      const row = raw.prepare('SELECT * FROM Supplier WHERE id = last_insert_rowid()').get() as Record<
        string,
        unknown
      >;
      return toSupplier(row);
    },
    update({
      where,
      data,
    }: {
      where: { id: number };
      data: { name?: string; color?: string | null; contactName?: string | null; contactPhone?: string | null };
    }): SupplierRow {
      if (data.name !== undefined) raw.prepare('UPDATE Supplier SET name = ? WHERE id = ?').run(data.name, where.id);
      if (data.color !== undefined) raw.prepare('UPDATE Supplier SET color = ? WHERE id = ?').run(data.color, where.id);
      if (data.contactName !== undefined)
        raw.prepare('UPDATE Supplier SET contactName = ? WHERE id = ?').run(data.contactName, where.id);
      if (data.contactPhone !== undefined)
        raw.prepare('UPDATE Supplier SET contactPhone = ? WHERE id = ?').run(data.contactPhone, where.id);
      return this.findUnique({ where })!;
    },
  },

  lot: {
    findUnique({
      where,
    }: {
      where: { itemId_yearMonth_lotNumber: { itemId: number; yearMonth: string; lotNumber: string } };
    }): LotRow | null {
      const { itemId, yearMonth, lotNumber } = where.itemId_yearMonth_lotNumber;
      const row = raw
        .prepare('SELECT * FROM Lot WHERE itemId = ? AND yearMonth = ? AND lotNumber = ?')
        .get(itemId, yearMonth, lotNumber) as Record<string, unknown> | undefined;
      return row ? toLot(row) : null;
    },
    findMany({ where }: { where?: { itemId?: number; yearMonth?: string } } = {}): LotRow[] {
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (where?.itemId !== undefined) {
        clauses.push('itemId = ?');
        params.push(where.itemId);
      }
      if (where?.yearMonth !== undefined) {
        clauses.push('yearMonth = ?');
        params.push(where.yearMonth);
      }
      const clause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = raw.prepare(`SELECT * FROM Lot ${clause} ORDER BY lotNumber ASC`).all(...params) as Record<
        string,
        unknown
      >[];
      return rows.map(toLot);
    },
    create({ data }: { data: { itemId: number; yearMonth: string; lotNumber: string } }): LotRow {
      raw
        .prepare('INSERT INTO Lot (itemId, yearMonth, lotNumber, createdAt) VALUES (?, ?, ?, ?)')
        .run(data.itemId, data.yearMonth, data.lotNumber, nowIso());
      return this.findUnique({ where: { itemId_yearMonth_lotNumber: data } })!;
    },
    delete({ where }: { where: { id: number } }): void {
      raw.prepare('DELETE FROM Lot WHERE id = ?').run(where.id);
      raw.prepare('DELETE FROM LotCount WHERE lotId = ?').run(where.id);
    },
  },

  lotCount: {
    findMany({ where }: { where: { lotId: { in: number[] }; yearMonth: string } }): LotCountRow[] {
      if (where.lotId.in.length === 0) return [];
      const placeholders = where.lotId.in.map(() => '?').join(',');
      const rows = raw
        .prepare(`SELECT * FROM LotCount WHERE yearMonth = ? AND lotId IN (${placeholders})`)
        .all(where.yearMonth, ...where.lotId.in) as Record<string, unknown>[];
      return rows.map(toLotCount);
    },
    upsert({
      where,
      data,
    }: {
      where: { lotId_yearMonth: { lotId: number; yearMonth: string } };
      data: { count: number; recordedBy: string };
    }): LotCountRow {
      const { lotId, yearMonth } = where.lotId_yearMonth;
      raw
        .prepare(
          `INSERT INTO LotCount (lotId, yearMonth, count, recordedBy, submittedAt)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(lotId, yearMonth) DO UPDATE SET count = excluded.count, recordedBy = excluded.recordedBy, submittedAt = excluded.submittedAt`,
        )
        .run(lotId, yearMonth, data.count, data.recordedBy, nowIso());
      const row = raw.prepare('SELECT * FROM LotCount WHERE lotId = ? AND yearMonth = ?').get(
        lotId,
        yearMonth,
      ) as Record<string, unknown>;
      return toLotCount(row);
    },
  },

  usageHistory: {
    findMany({ where }: { where: { itemId: number; yearMonth: { in: string[] } } }): UsageHistoryRow[] {
      if (where.yearMonth.in.length === 0) return [];
      const placeholders = where.yearMonth.in.map(() => '?').join(',');
      const rows = raw
        .prepare(`SELECT * FROM UsageHistory WHERE itemId = ? AND yearMonth IN (${placeholders})`)
        .all(where.itemId, ...where.yearMonth.in) as Record<string, unknown>[];
      return rows.map(toUsage);
    },
    upsert({
      where,
      update,
      create,
    }: {
      where: { itemId_yearMonth: { itemId: number; yearMonth: string } };
      update: { outboundQty: number; source: string };
      create: { itemId: number; yearMonth: string; outboundQty: number; source: string };
    }): void {
      const { itemId, yearMonth } = where.itemId_yearMonth;
      raw
        .prepare(
          `INSERT INTO UsageHistory (itemId, yearMonth, outboundQty, source, createdAt)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(itemId, yearMonth) DO UPDATE SET outboundQty = excluded.outboundQty, source = excluded.source`,
        )
        .run(itemId, yearMonth, update.outboundQty, update.source, nowIso());
    },
  },

  monthlyRecord: {
    findUnique({
      where,
    }: {
      where: { itemId_yearMonth: { itemId: number; yearMonth: string } };
    }): MonthlyRecordRow | null {
      const { itemId, yearMonth } = where.itemId_yearMonth;
      const row = raw
        .prepare('SELECT * FROM MonthlyRecord WHERE itemId = ? AND yearMonth = ?')
        .get(itemId, yearMonth) as Record<string, unknown> | undefined;
      return toRecord(row);
    },
    findMany({ where }: { where: { yearMonth: string; itemId: { in: number[] } } }): MonthlyRecordRow[] {
      if (where.itemId.in.length === 0) return [];
      const placeholders = where.itemId.in.map(() => '?').join(',');
      const rows = raw
        .prepare(`SELECT * FROM MonthlyRecord WHERE yearMonth = ? AND itemId IN (${placeholders})`)
        .all(where.yearMonth, ...where.itemId.in) as Record<string, unknown>[];
      return rows.map((r) => toRecord(r)!);
    },
    upsert({
      where,
      update,
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
    }): MonthlyRecordRow {
      const { itemId, yearMonth } = where.itemId_yearMonth;
      const now = nowIso();
      raw
        .prepare(
          `INSERT INTO MonthlyRecord
             (itemId, yearMonth, staffId, incomingQty, actualCount, previousStock, expectedCount, avgUsageUsed, variance, flagged, isBaseline, submittedAt, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(itemId, yearMonth) DO UPDATE SET
             staffId = excluded.staffId,
             incomingQty = excluded.incomingQty,
             actualCount = excluded.actualCount,
             previousStock = excluded.previousStock,
             expectedCount = excluded.expectedCount,
             avgUsageUsed = excluded.avgUsageUsed,
             variance = excluded.variance,
             flagged = excluded.flagged,
             isBaseline = excluded.isBaseline,
             submittedAt = excluded.submittedAt,
             updatedAt = excluded.updatedAt`,
        )
        .run(
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
        );
      return this.findUnique({ where })!;
    },
  },

  purchaseOrder: {
    findUnique({
      where,
    }: {
      where: { itemId_targetYearMonth: { itemId: number; targetYearMonth: string } };
    }): PurchaseOrderRow | null {
      const { itemId, targetYearMonth } = where.itemId_targetYearMonth;
      const row = raw
        .prepare('SELECT * FROM PurchaseOrder WHERE itemId = ? AND targetYearMonth = ?')
        .get(itemId, targetYearMonth) as Record<string, unknown> | undefined;
      return toPurchaseOrder(row);
    },
    findMany({ where }: { where: { targetYearMonth: string; itemId?: { in: number[] } } }): PurchaseOrderRow[] {
      if (where.itemId && where.itemId.in.length === 0) return [];
      if (where.itemId) {
        const placeholders = where.itemId.in.map(() => '?').join(',');
        const rows = raw
          .prepare(`SELECT * FROM PurchaseOrder WHERE targetYearMonth = ? AND itemId IN (${placeholders})`)
          .all(where.targetYearMonth, ...where.itemId.in) as Record<string, unknown>[];
        return rows.map((r) => toPurchaseOrder(r)!);
      }
      const rows = raw.prepare('SELECT * FROM PurchaseOrder WHERE targetYearMonth = ?').all(
        where.targetYearMonth,
      ) as Record<string, unknown>[];
      return rows.map((r) => toPurchaseOrder(r)!);
    },
    upsert({
      where,
      update,
      create,
    }: {
      where: { itemId_targetYearMonth: { itemId: number; targetYearMonth: string } };
      update: { orderedQty: number; orderedBy: string };
      create: { itemId: number; targetYearMonth: string; orderedQty: number; orderedAt: string; orderedBy: string };
    }): PurchaseOrderRow {
      const { itemId, targetYearMonth } = where.itemId_targetYearMonth;
      const existing = this.findUnique({ where });
      if (existing) {
        raw
          .prepare('UPDATE PurchaseOrder SET orderedQty = ?, orderedBy = ? WHERE itemId = ? AND targetYearMonth = ?')
          .run(update.orderedQty, update.orderedBy, itemId, targetYearMonth);
        return this.findUnique({ where })!;
      }
      raw
        .prepare(
          `INSERT INTO PurchaseOrder (itemId, targetYearMonth, orderedQty, orderedAt, orderedBy, createdAt)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(itemId, targetYearMonth, create.orderedQty, create.orderedAt, create.orderedBy, nowIso());
      return this.findUnique({ where })!;
    },
    delete({ where }: { where: { id: number } }): void {
      raw.prepare('DELETE FROM PurchaseOrder WHERE id = ?').run(where.id);
    },
  },

  receipt: {
    findUnique({ where }: { where: { id: number } }): ReceiptRow | null {
      const row = raw.prepare('SELECT * FROM Receipt WHERE id = ?').get(where.id) as
        | Record<string, unknown>
        | undefined;
      return row ? toReceipt(row) : null;
    },
    findMany({ where }: { where: { purchaseOrderId: { in: number[] } } }): ReceiptRow[] {
      if (where.purchaseOrderId.in.length === 0) return [];
      const placeholders = where.purchaseOrderId.in.map(() => '?').join(',');
      const rows = raw
        .prepare(`SELECT * FROM Receipt WHERE purchaseOrderId IN (${placeholders}) ORDER BY receivedDate ASC, id ASC`)
        .all(...where.purchaseOrderId.in) as Record<string, unknown>[];
      return rows.map(toReceipt);
    },
    create({
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
    }): ReceiptRow {
      raw
        .prepare(
          `INSERT INTO Receipt (purchaseOrderId, receivedQty, receivedDate, hasPackingSlip, recordedBy, note, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          data.purchaseOrderId,
          data.receivedQty,
          data.receivedDate,
          data.hasPackingSlip ? 1 : 0,
          data.recordedBy,
          data.note ?? null,
          nowIso(),
        );
      const row = raw.prepare('SELECT * FROM Receipt WHERE id = last_insert_rowid()').get() as Record<
        string,
        unknown
      >;
      return toReceipt(row);
    },
    update({
      where,
      data,
    }: {
      where: { id: number };
      data: { receivedQty?: number; receivedDate?: string; hasPackingSlip?: boolean; note?: string | null };
    }): ReceiptRow {
      if (data.receivedQty !== undefined) {
        raw.prepare('UPDATE Receipt SET receivedQty = ? WHERE id = ?').run(data.receivedQty, where.id);
      }
      if (data.receivedDate !== undefined) {
        raw.prepare('UPDATE Receipt SET receivedDate = ? WHERE id = ?').run(data.receivedDate, where.id);
      }
      if (data.hasPackingSlip !== undefined) {
        raw.prepare('UPDATE Receipt SET hasPackingSlip = ? WHERE id = ?').run(data.hasPackingSlip ? 1 : 0, where.id);
      }
      if (data.note !== undefined) {
        raw.prepare('UPDATE Receipt SET note = ? WHERE id = ?').run(data.note, where.id);
      }
      return this.findUnique({ where })!;
    },
    delete({ where }: { where: { id: number } }): void {
      raw.prepare('DELETE FROM Receipt WHERE id = ?').run(where.id);
    },
  },

  changeLog: {
    create({
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
    }): void {
      raw
        .prepare(
          `INSERT INTO ChangeLog (entityType, entityKey, field, oldValue, newValue, changedBy, changedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(data.entityType, data.entityKey, data.field, data.oldValue, data.newValue, data.changedBy, nowIso());
    },
    findByType(entityType: string): ChangeLogRow[] {
      const rows = raw.prepare('SELECT * FROM ChangeLog WHERE entityType = ? ORDER BY id ASC').all(
        entityType,
      ) as Record<string, unknown>[];
      return rows.map(toChangeLog);
    },
  },

  auditLog: {
    create({ data }: { data: { actorId: string; action: string; detail: string } }): void {
      raw
        .prepare('INSERT INTO AuditLog (actorId, action, detail, createdAt) VALUES (?, ?, ?, ?)')
        .run(data.actorId, data.action, data.detail, nowIso());
    },
  },
};
