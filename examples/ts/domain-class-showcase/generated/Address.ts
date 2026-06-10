import { coerceDate, normalise, normaliseNullable } from "@polyprism/runtime";
import { Decimal } from "@prisma/client/runtime/library";
import { Customer } from "./Customer.js";

export interface AddressInit {
  line1: string;
  line2?: string | null;
  countryCode: string;
  shippingRate?: Decimal | number | string;
  customerId: string;
  customer?: Customer;
}

export class Address {
  #id!: string;
  #line1!: string;
  #line2: string | null = null;
  #countryCode!: string;
  #shippingRate!: Decimal;
  #customerId!: string;
  #customer: Customer | undefined = undefined;
  #createdAt!: Date;

  /**
   * @remarks Prisma-assigned at insert time — reading on a freshly-constructed instance returns `undefined` until the row has been persisted (and `from()` has hydrated the value back, or Prisma has returned the populated row). The declared type is honest post-insert.
   */
  get id(): string {
    return this.#id;
  }
  set id(v: string) {
    this.#id = v;
  }

  get line1(): string {
    return this.#line1;
  }
  set line1(v: string) {
    this.#line1 = normalise(v, ["trim"] as const);
  }

  get line2(): string | null {
    return this.#line2;
  }
  set line2(v: string | null) {
    this.#line2 = v === null ? null : normaliseNullable(v, ["trim","nullEmptyToNull"] as const);
  }

  /**
   * ISO country code, normalised to uppercase to match @db.VarChar(2).
   * @db.VarChar(2)
   */
  get countryCode(): string {
    return this.#countryCode;
  }
  set countryCode(v: string) {
    this.#countryCode = normalise(v, ["trim","uppercase"] as const);
  }

  /**
   * Decimal default-coerce — accepts Decimal, number, or string. Shopify
   * money values arrive as "10.99" strings; this lets them flow through.
   * @db.Decimal(15, 2)
   */
  get shippingRate(): Decimal {
    return this.#shippingRate;
  }
  set shippingRate(v: Decimal | number | string) {
    this.#shippingRate = (v instanceof Decimal ? v : new Decimal(v));
  }

  get customerId(): string {
    return this.#customerId;
  }
  set customerId(v: string) {
    this.#customerId = v;
  }

  get customer(): Customer | undefined {
    return this.#customer;
  }
  set customer(v: Customer) {
    this.#customer = v;
  }

  /**
   * @remarks Prisma-assigned at insert time — reading on a freshly-constructed instance returns `undefined` until the row has been persisted (and `from()` has hydrated the value back, or Prisma has returned the populated row). The declared type is honest post-insert.
   */
  get createdAt(): Date {
    return this.#createdAt;
  }
  set createdAt(v: Date | string | number) {
    this.#createdAt = coerceDate(v, "Address.createdAt");
  }

  constructor(init: AddressInit) {
    for (const key of ["id", "line1", "line2", "countryCode", "shippingRate", "customerId", "customer", "createdAt"] as const) {
      const desc = Object.getOwnPropertyDescriptor(Address.prototype, key);
      if (desc) Object.defineProperty(this, key, { ...desc, enumerable: true });
    }

    this.line1 = init.line1;
    if (init.line2 !== undefined) this.line2 = init.line2;
    this.countryCode = init.countryCode;
    this.shippingRate = init.shippingRate ?? new Decimal(0);
    this.customerId = init.customerId;
    if (init.customer !== undefined) this.customer = init.customer;
  }

  /**
   * Hydrate Address from an untrusted object shape (e.g. a JSON body
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
  static from(data: Record<string, unknown>): Address {
    const initKeys = ["line1", "line2", "countryCode", "shippingRate", "customerId", "customer"] as const;
    const init: Record<string, unknown> = {};
    for (const key of initKeys) {
      if (data[key] !== undefined) init[key] = data[key];
    }
    if (init.customer !== undefined && init.customer !== null) {
      init.customer = init.customer instanceof Customer
        ? init.customer
        : Customer.from(init.customer as Record<string, unknown>);
    }
    const instance = new Address(init as unknown as AddressInit);
    const assignKeys = ["id", "createdAt"] as const;
    for (const key of assignKeys) {
      if (data[key] !== undefined) {
        (instance as unknown as Record<string, unknown>)[key] = data[key];
      }
    }
    return instance;
  }

  /**
   * Fluent builder for Address. One chainable method per init-writable
   * field; `.build()` calls the constructor (which fires the full setter
   * pipeline, including any required-field checks).
   */
  static builder(): AddressBuilder {
    return new AddressBuilder();
  }
}

export class AddressBuilder {
  readonly #init: Partial<AddressInit> = {};

  line1(v: string): this {
    this.#init.line1 = v;
    return this;
  }

  line2(v: string | null): this {
    this.#init.line2 = v;
    return this;
  }

  countryCode(v: string): this {
    this.#init.countryCode = v;
    return this;
  }

  shippingRate(v: Decimal | number | string): this {
    this.#init.shippingRate = v;
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

  build(): Address {
    return new Address(this.#init as AddressInit);
  }
}
