import { coerceBigInt, coerceInt, normalise } from "@polyprism/runtime";
import { Decimal } from "@prisma/client/runtime/library";
import type { Order } from "./Order.js";

export interface OrderItemInit {
  sku: string;
  quantity?: number | string;
  unitPrice: Decimal | number | string;
  orderId: bigint | number | string;
  order: Order;
}

export class OrderItem {
  #id!: string;
  #sku!: string;
  #quantity!: number;
  #unitPrice!: Decimal;
  #orderId!: bigint;
  #order!: Order;

  get id(): string {
    return this.#id;
  }
  set id(v: string) {
    this.#id = v;
  }

  get sku(): string {
    return this.#sku;
  }
  set sku(v: string) {
    this.#sku = normalise(v, ["trim"] as const);
  }

  /**
   * Int default-coerce.
   */
  get quantity(): number {
    return this.#quantity;
  }
  set quantity(v: number | string) {
    this.#quantity = coerceInt(v, "OrderItem.quantity");
  }

  /**
   * Decimal default-coerce; per-unit price.
   * @db.Decimal(15, 2)
   */
  get unitPrice(): Decimal {
    return this.#unitPrice;
  }
  set unitPrice(v: Decimal | number | string) {
    this.#unitPrice = (v instanceof Decimal ? v : new Decimal(v));
  }

  get orderId(): bigint {
    return this.#orderId;
  }
  set orderId(v: bigint | number | string) {
    this.#orderId = coerceBigInt(v, "OrderItem.orderId");
  }

  get order(): Order {
    return this.#order;
  }
  set order(v: Order) {
    this.#order = v;
  }

  constructor(init: OrderItemInit) {
    for (const key of ["id", "sku", "quantity", "unitPrice", "orderId", "order"] as const) {
      const desc = Object.getOwnPropertyDescriptor(OrderItem.prototype, key);
      if (desc) Object.defineProperty(this, key, { ...desc, enumerable: true });
    }

    this.sku = init.sku;
    this.quantity = init.quantity ?? 1;
    this.unitPrice = init.unitPrice;
    this.orderId = init.orderId;
    this.order = init.order;
  }

  /**
   * Hydrate OrderItem from an untrusted object shape (e.g. a JSON body
   * or a Prisma row). Routes through the setter pipeline so `@coerce` and
   * `@normalise` rules fire. Unknown keys are silently dropped.
   *
   * **Not a validator.** `from()` is a type-aware constructor adapter, not
   * a schema validator. It does not check that required fields are present,
   * does not reject explicit `null` for non-nullable fields, and does not
   * verify cross-field invariants. If the inbound data is untrusted (HTTP
   * body, queue message, third-party API), pre-validate at the boundary —
   * runtime schema validation arrives in `@polyprism/ts-zod`.
   */
  static from(data: Record<string, unknown>): OrderItem {
    const initKeys = ["sku", "quantity", "unitPrice", "orderId", "order"] as const;
    const init: Record<string, unknown> = {};
    for (const key of initKeys) {
      if (data[key] !== undefined) init[key] = data[key];
    }
    const instance = new OrderItem(init as unknown as OrderItemInit);
    const assignKeys = ["id"] as const;
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
      orderId: this.orderId === undefined ? undefined : this.orderId.toString(),
    };
  }

  /**
   * Fluent builder for OrderItem. One chainable method per init-writable
   * field; `.build()` calls the constructor (which fires the full setter
   * pipeline, including any required-field checks).
   */
  static builder(): OrderItemBuilder {
    return new OrderItemBuilder();
  }
}

export class OrderItemBuilder {
  readonly #init: Partial<OrderItemInit> = {};

  sku(v: string): this {
    this.#init.sku = v;
    return this;
  }

  quantity(v: number | string): this {
    this.#init.quantity = v;
    return this;
  }

  unitPrice(v: Decimal | number | string): this {
    this.#init.unitPrice = v;
    return this;
  }

  orderId(v: bigint | number | string): this {
    this.#init.orderId = v;
    return this;
  }

  order(v: Order): this {
    this.#init.order = v;
    return this;
  }

  build(): OrderItem {
    return new OrderItem(this.#init as OrderItemInit);
  }
}
