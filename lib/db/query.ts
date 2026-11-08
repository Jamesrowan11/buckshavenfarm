import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { pool } from "./pool";
import { COLUMNS, JSON_COLUMNS, POLICIES, type Cond, type Me } from "./policies";

// A small query builder with the same calls the pages already used
// (.from().select().eq().order()...), running against the app's own MariaDB
// database. Every query is limited by the table's policy for the signed-in
// user (lib/db/policies.ts), so the permission rules can't be skipped.

type Result<T = any> = { data: T; error: { message: string } | null };
type Filter = Cond;
type Row = Record<string, unknown>;

const IDENT = /^[a-z_]+$/;

function quoteCol(table: string, col: string): string {
  if (!IDENT.test(col) || !COLUMNS[table]?.includes(col)) {
    throw new Error(`Unknown column ${table}.${col}`);
  }
  return `t.\`${col}\``;
}

function toDb(table: string, col: string, v: unknown): unknown {
  if (JSON_COLUMNS[table]?.includes(col) && v !== null && v !== undefined) return JSON.stringify(v);
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

export class Query<T = any> implements PromiseLike<Result<T>> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private cols: string[] = [];
  private embed: { alias: string; fk: string; cols: string[] } | null = null;
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private lim: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private rows: Row[] = [];
  private changes: Row = {};

  constructor(private table: string, private me: Me) {
    if (!POLICIES[table]) throw new Error(`Unknown table ${table}`);
  }

  select(columns = "*"): this {
    // Supports "*", "a, b" and one embedded profile: "*, profiles:<fk>(name)".
    for (const part of columns.split(",").map((s) => s.trim()).filter(Boolean)) {
      const m = part.match(/^profiles:([a-z_]+)\(([a-z_, ]+)\)$/);
      if (m) {
        this.embed = { alias: "profiles", fk: m[1], cols: m[2].split(",").map((s) => s.trim()) };
      } else if (part === "*") {
        this.cols.push(...COLUMNS[this.table]);
      } else {
        quoteCol(this.table, part);
        this.cols.push(part);
      }
    }
    return this;
  }

  insert(values: Row | Row[]): this {
    this.op = "insert";
    this.rows = Array.isArray(values) ? values : [values];
    return this;
  }

  update(values: Row): this {
    this.op = "update";
    this.changes = values;
    return this;
  }

  delete(): this {
    this.op = "delete";
    return this;
  }

  private cmp(col: string, sqlOp: string, value: unknown): this {
    if (value === null && sqlOp === "=") {
      this.filters.push({ sql: `${quoteCol(this.table, col)} IS NULL`, params: [] });
    } else {
      this.filters.push({ sql: `${quoteCol(this.table, col)} ${sqlOp} ?`, params: [toDb(this.table, col, value)] });
    }
    return this;
  }

  eq(col: string, value: unknown): this {
    return this.cmp(col, "=", value);
  }
  neq(col: string, value: unknown): this {
    return this.cmp(col, "<>", value);
  }
  gte(col: string, value: unknown): this {
    return this.cmp(col, ">=", value);
  }
  lte(col: string, value: unknown): this {
    return this.cmp(col, "<=", value);
  }
  gt(col: string, value: unknown): this {
    return this.cmp(col, ">", value);
  }
  lt(col: string, value: unknown): this {
    return this.cmp(col, "<", value);
  }

  /** Only the forms the app uses: "col.eq.value" and "col.is.null", comma-separated. */
  or(expr: string): this {
    const parts = expr.split(",").map((p) => {
      const m = p.trim().match(/^([a-z_]+)\.(eq|is)\.(.+)$/);
      if (!m) throw new Error(`Unsupported filter: ${p}`);
      const col = quoteCol(this.table, m[1]);
      if (m[2] === "is" && m[3] === "null") return { sql: `${col} IS NULL`, params: [] as unknown[] };
      return { sql: `${col} = ?`, params: [m[3]] as unknown[] };
    });
    this.filters.push({ sql: `(${parts.map((p) => p.sql).join(" OR ")})`, params: parts.flatMap((p) => p.params) });
    return this;
  }

  order(col: string, opts: { ascending?: boolean } = {}): this {
    quoteCol(this.table, col);
    this.orders.push({ col, asc: opts.ascending !== false });
    return this;
  }

  limit(n: number): this {
    this.lim = Math.max(0, Math.floor(n));
    return this;
  }

  single(): PromiseLike<Result<T extends (infer U)[] ? U : any>> {
    this.mode = "single";
    return this as any;
  }

  maybeSingle(): PromiseLike<Result<T extends (infer U)[] ? U | null : any>> {
    this.mode = "maybe";
    return this as any;
  }

  then<A = Result<T>, B = never>(
    onfulfilled?: ((value: Result<T>) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run().then(onfulfilled, onrejected);
  }

  private where(policy: Cond): { sql: string; params: unknown[] } {
    const all = [policy, ...this.filters];
    return { sql: all.map((c) => `(${c.sql})`).join(" AND "), params: all.flatMap((c) => c.params) };
  }

  private async run(): Promise<Result<any>> {
    try {
      const policy = POLICIES[this.table];
      const db = pool();
      if (this.op === "select") {
        const cols = (this.cols.length ? this.cols : COLUMNS[this.table]).map((c) => quoteCol(this.table, c));
        let join = "";
        if (this.embed) {
          quoteCol(this.table, this.embed.fk);
          for (const c of this.embed.cols) {
            if (!COLUMNS.profiles.includes(c)) throw new Error(`Unknown column profiles.${c}`);
            cols.push(`p.\`${c}\` AS \`__p_${c}\``);
          }
          cols.push("p.`id` AS `__p_id`");
          join = ` LEFT JOIN profiles p ON p.id = t.\`${this.embed.fk}\``;
        }
        const w = this.where(policy.select(this.me));
        // Postgres puts NULLs last when ascending and first when descending; keep that.
        const order = this.orders.length
          ? " ORDER BY " + this.orders.map((o) => `(t.\`${o.col}\` IS NULL) ${o.asc ? "ASC" : "DESC"}, t.\`${o.col}\` ${o.asc ? "ASC" : "DESC"}`).join(", ")
          : "";
        const limit = this.mode !== "many" ? " LIMIT 2" : this.lim !== null ? ` LIMIT ${this.lim}` : "";
        const [rows] = await db.query<RowDataPacket[]>(
          `SELECT ${cols.join(", ")} FROM \`${this.table}\` t${join} WHERE ${w.sql}${order}${limit}`,
          w.params,
        );
        const out = rows.map((r) => this.shape(r));
        if (this.mode === "single") {
          return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: "Expected exactly one row" } };
        }
        if (this.mode === "maybe") return { data: out[0] ?? null, error: null };
        return { data: out, error: null };
      }

      if (this.op === "insert") {
        for (const row of this.rows) {
          if (!policy.insert(this.me, row)) return { data: null, error: { message: "Not allowed" } };
        }
        for (const row of this.rows) {
          const r: Row = { id: randomUUID(), ...row };
          const keys = Object.keys(r);
          keys.forEach((k) => quoteCol(this.table, k));
          await db.query(
            `INSERT INTO \`${this.table}\` (${keys.map((k) => `\`${k}\``).join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
            keys.map((k) => toDb(this.table, k, r[k])),
          );
        }
        return { data: null, error: null };
      }

      if (this.op === "update") {
        if (!policy.updateCheck(this.me, this.changes)) return { data: null, error: { message: "Not allowed" } };
        const keys = Object.keys(this.changes);
        if (keys.length === 0) return { data: null, error: null };
        const w = this.where(policy.update(this.me));
        const [res] = await db.query<ResultSetHeader>(
          `UPDATE \`${this.table}\` t SET ${keys.map((k) => `${quoteCol(this.table, k)} = ?`).join(", ")} WHERE ${w.sql}`,
          [...keys.map((k) => toDb(this.table, k, this.changes[k])), ...w.params],
        );
        void res;
        return { data: null, error: null };
      }

      const w = this.where(policy.delete(this.me));
      if (this.filters.length === 0) return { data: null, error: { message: "Refusing to delete without a filter" } };
      await db.query(`DELETE t FROM \`${this.table}\` t WHERE ${w.sql}`, w.params);
      return { data: null, error: null };
    } catch (e) {
      console.error(`[db] ${this.table} ${this.op}:`, e);
      return { data: this.mode === "many" && this.op === "select" ? [] : null, error: { message: "Database error" } };
    }
  }

  private shape(r: RowDataPacket): Row {
    const out: Row = {};
    const embed: Row = {};
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith("__p_")) embed[k.slice(4)] = v;
      else if (JSON_COLUMNS[this.table]?.includes(k) && typeof v === "string") {
        try {
          out[k] = JSON.parse(v);
        } catch {
          out[k] = v;
        }
      } else out[k] = v;
    }
    if (this.embed) {
      const { id, ...rest } = embed;
      out[this.embed.alias] = id ? rest : null;
    }
    return out;
  }
}
