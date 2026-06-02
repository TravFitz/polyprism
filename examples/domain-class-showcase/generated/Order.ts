import { coerceBigInt, coerceDate, coerceFloat, coerceInt } from "@polyprism/runtime";
import { Decimal } from "@prisma/client/runtime/library";
import type { Customer } from "./Customer.js";
import { OrderStatus } from "./enums/OrderStatus.js";
import type { OrderItem } from "./OrderItem.js";

export interface OrderInit {
  status?: OrderStatus;
  total: Decimal | number | string;
  exchangeRate?: number | string;
  itemCount?: number | string;
  paidAt?: Date | string | number | null;
  customerId: string;
  customer: Customer;
  parentOrderId?: bigint | number | string | null;
  parentOrder?: Order | null;
  refunds?: Order[];
  items?: OrderItem[];
}

export class Order {
  #id!: bigint;
  #status!: OrderStatus;
  #total!: Decimal;
  #exchangeRate!: number;
  #itemCount!: number;
  #placedAt!: Date;
  #paidAt: Date | null = null;
  #customerId!: string;
  #customer!: Customer;
  #parentOrderId: bigint | null = null;
  #parentOrder: Order | null = null;
  #refunds: Order[] = [];
  #items: OrderItem[] = [];

  /**
   * BigInt default-coerce — accepts bigint, number, or stringified bigint.
   * Shopify order IDs frequently overflow Number.MAX_SAFE_INTEGER.
   * @remarks Prisma-assigned at insert time — reading on a freshly-constructed instance returns `undefined` until the row has been persisted (and `from()` has hydrated the value back, or Prisma has returned the populated row). The declared type is honest post-insert.
   */
  get id(): bigint {
    return this.#id;
  }
  set id(v: bigint | number | string) {
    this.#id = coerceBigInt(v, "Order.id");
  }

  get status(): OrderStatus {
    return this.#status;
  }
  set status(v: OrderStatus) {
    this.#status = v;
  }

  /**
   * @db.Decimal(15, 2)
   */
  get total(): Decimal {
    return this.#total;
  }
  set total(v: Decimal | number | string) {
    this.#total = (v instanceof Decimal ? v : new Decimal(v));
  }

  /**
   * Float default-coerce.
   */
  get exchangeRate(): number {
    return this.#exchangeRate;
  }
  set exchangeRate(v: number | string) {
    this.#exchangeRate = coerceFloat(v, "Order.exchangeRate");
  }

  /**
   * Int default-coerce.
   */
  get itemCount(): number {
    return this.#itemCount;
  }
  set itemCount(v: number | string) {
    this.#itemCount = coerceInt(v, "Order.itemCount");
  }

  /**
   * DateTime default-coerce — accepts Date, ISO string, or epoch number.
   * @remarks Prisma-assigned at insert time — reading on a freshly-constructed instance returns `undefined` until the row has been persisted (and `from()` has hydrated the value back, or Prisma has returned the populated row). The declared type is honest post-insert.
   */
  get placedAt(): Date {
    return this.#placedAt;
  }
  set placedAt(v: Date | string | number) {
    this.#placedAt = coerceDate(v, "Order.placedAt");
  }

  /**
   * Nullable DateTime — coerce-by-default still applies, just widened to | null.
   */
  get paidAt(): Date | null {
    return this.#paidAt;
  }
  set paidAt(v: Date | string | number | null) {
    this.#paidAt = v === null ? null : coerceDate(v, "Order.paidAt");
  }

  get customerId(): string {
    return this.#customerId;
  }
  set customerId(v: string) {
    this.#customerId = v;
  }

  get customer(): Customer {
    return this.#customer;
  }
  set customer(v: Customer) {
    this.#customer = v;
  }

  get parentOrderId(): bigint | null {
    return this.#parentOrderId;
  }
  set parentOrderId(v: bigint | number | string | null) {
    this.#parentOrderId = v === null ? null : coerceBigInt(v, "Order.parentOrderId");
  }

  get parentOrder(): Order | null {
    return this.#parentOrder;
  }
  set parentOrder(v: Order | null) {
    this.#parentOrder = v;
  }

  get refunds(): Order[] {
    return this.#refunds;
  }
  set refunds(v: Order[]) {
    this.#refunds = v;
  }

  get items(): OrderItem[] {
    return this.#items;
  }
  set items(v: OrderItem[]) {
    this.#items = v;
  }

  constructor(init: OrderInit) {
    for (const key of ["id", "status", "total", "exchangeRate", "itemCount", "placedAt", "paidAt", "customerId", "customer", "parentOrderId", "parentOrder", "refunds", "items"] as const) {
      const desc = Object.getOwnPropertyDescriptor(Order.prototype, key);
      if (desc) Object.defineProperty(this, key, { ...desc, enumerable: true });
    }

    this.status = init.status ?? OrderStatus.PENDING;
    this.total = init.total;
    this.exchangeRate = init.exchangeRate ?? 1;
    this.itemCount = init.itemCount ?? 0;
    if (init.paidAt !== undefined) this.paidAt = init.paidAt;
    this.customerId = init.customerId;
    this.customer = init.customer;
    if (init.parentOrderId !== undefined) this.parentOrderId = init.parentOrderId;
    if (init.parentOrder !== undefined) this.parentOrder = init.parentOrder;
    if (init.refunds !== undefined) this.refunds = init.refunds;
    if (init.items !== undefined) this.items = init.items;
  }

  /**
   * Hydrate Order from an untrusted object shape (e.g. a JSON body
   * or a Prisma row). Routes through the setter pipeline so `@coerce` and
   * `@normalise` rules fire. Unknown keys are silently dropped.
   *
   * **Not a validator.** `from()` is a type-aware constructor adapter, not
   * a schema validator. It does not check that required fields are present,
   * does not reject explicit `null` for non-nullable fields, and does not
   * verify cross-field invariants. If the inbound data is untrusted (HTTP
   * body, queue message, third-party API), pre-validate at the boundary —
   * a Zod-based runtime validation pattern is planned for a future release.
   *
   * **Can still throw at the setter.** Even though there's no validation
   * layer, individual setters may throw `TypeError` if a value can't be
   * coerced to the declared type (e.g. a non-numeric string for an `Int`
   * column). This applies to both the init-shape keys and the
   * prisma-assigned keys (id, createdAt, etc.) that get assigned
   * post-construction. The error includes the field path.
   */
  static from(data: Record<string, unknown>): Order {
    const initKeys = ["status", "total", "exchangeRate", "itemCount", "paidAt", "customerId", "customer", "parentOrderId", "parentOrder", "refunds", "items"] as const;
    const init: Record<string, unknown> = {};
    for (const key of initKeys) {
      if (data[key] !== undefined) init[key] = data[key];
    }
    const instance = new Order(init as unknown as OrderInit);
    const assignKeys = ["id", "placedAt"] as const;
    for (const key of assignKeys) {
      if (data[key] !== undefined) {
        (instance as unknown as Record<string, unknown>)[key] = data[key];
      }
    }
    return instance;
  }

  /**
   * JSON-safe view of this instance.
   *
   * BigInt fields are stringified because JSON.stringify throws on bigint
   * natively. Date and Decimal handle their own serialisation via their
   * built-in toJSON() methods. Hidden fields (@hide) are absent because
   * they are not enumerable properties on this instance.
   *
   * The `this as unknown as Record<string, unknown>` cast at the spread
   * source is what TS strict mode needs — the class lacks an index
   * signature, so a direct `{ ...this }` widening to Record fails. The
   * runtime behaviour is identical; only the type assertion changes.
   */
  toJSON(): Record<string, unknown> {
    return {
      ...(this as unknown as Record<string, unknown>),
      id: this.id === undefined ? undefined : this.id.toString(),
      parentOrderId: this.parentOrderId == null ? this.parentOrderId : this.parentOrderId.toString(),
    };
  }

  /**
   * Fluent builder for Order. One chainable method per init-writable
   * field; `.build()` calls the constructor (which fires the full setter
   * pipeline, including any required-field checks).
   */
  static builder(): OrderBuilder {
    return new OrderBuilder();
  }
}

export class OrderBuilder {
  readonly #init: Partial<OrderInit> = {};

  status(v: OrderStatus): this {
    this.#init.status = v;
    return this;
  }

  total(v: Decimal | number | string): this {
    this.#init.total = v;
    return this;
  }

  exchangeRate(v: number | string): this {
    this.#init.exchangeRate = v;
    return this;
  }

  itemCount(v: number | string): this {
    this.#init.itemCount = v;
    return this;
  }

  paidAt(v: Date | string | number | null): this {
    this.#init.paidAt = v;
    return this;
  }

  customerId(v: string): this {
    this.#init.customerId = v;
    return this;
  }

  customer(v: Customer): this {
    this.#init.customer = v;
    return this;
  }

  parentOrderId(v: bigint | number | string | null): this {
    this.#init.parentOrderId = v;
    return this;
  }

  parentOrder(v: Order | null): this {
    this.#init.parentOrder = v;
    return this;
  }

  refunds(v: Order[]): this {
    this.#init.refunds = v;
    return this;
  }

  items(v: OrderItem[]): this {
    this.#init.items = v;
    return this;
  }

  build(): Order {
    return new Order(this.#init as OrderInit);
  }
}
