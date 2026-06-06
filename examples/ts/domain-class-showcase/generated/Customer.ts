import { coerceDate, normalise, normaliseNullable } from "@polyprism/runtime";
import type { Address } from "./Address.js";
import { CustomerTier } from "./enums/CustomerTier.js";
import type { CustomerLanguageSettings } from "./json-types/CustomerLanguageSettings.js";
import type { Order } from "./Order.js";

export interface CustomerInit {
  email: string;
  displayName: string;
  tier?: CustomerTier;
  internalSeq?: number;
  legacyExternalId?: string | number | boolean | bigint | null;
  vatNumber?: string | null;
  languageSettings: CustomerLanguageSettings;
  address?: Address | null;
  orders?: Order[];
}

export class Customer {
  #id!: string;
  #email!: string;
  #displayName!: string;
  #tier!: CustomerTier;
  #internalSeq!: number;
  #legacyExternalId: string | null = null;
  #vatNumber: string | null = null;
  #languageSettings!: CustomerLanguageSettings;
  #createdAt!: Date;
  #address: Address | null = null;
  #orders: Order[] = [];

  /**
   * @remarks Prisma-assigned at insert time — reading on a freshly-constructed instance returns `undefined` until the row has been persisted (and `from()` has hydrated the value back, or Prisma has returned the populated row). The declared type is honest post-insert.
   */
  get id(): string {
    return this.#id;
  }
  set id(v: string) {
    this.#id = v;
  }

  /**
   * Normalised: trimmed + lowercased on assignment.
   */
  get email(): string {
    return this.#email;
  }
  set email(v: string) {
    this.#email = normalise(v, ["trim","lowercase"] as const);
  }

  /**
   * Normalised: trimmed only — preserves original casing for display.
   */
  get displayName(): string {
    return this.#displayName;
  }
  set displayName(v: string) {
    this.#displayName = normalise(v, ["trim"] as const);
  }

  get tier(): CustomerTier {
    return this.#tier;
  }
  set tier(v: CustomerTier) {
    this.#tier = v;
  }

  /**
   * Strict-coerce: internal counter that must always be a plain number.
   * Boundary code passing "5" here is a bug, not data laundering.
   */
  get internalSeq(): number {
    return this.#internalSeq;
  }
  set internalSeq(v: number) {
    this.#internalSeq = v;
  }

  /**
   * Cross-type @coerce: this column stores Shopify's stringified legacy IDs.
   * The setter accepts both the canonical String form and a Number, casting
   * numerics to string on the way in.
   */
  get legacyExternalId(): string | null {
    return this.#legacyExternalId;
  }
  set legacyExternalId(v: string | number | boolean | bigint | null) {
    this.#legacyExternalId = v === null ? null : String(v);
  }

  /**
   * Nullable string normalised, with empty-string → null collapse.
   */
  get vatNumber(): string | null {
    return this.#vatNumber;
  }
  set vatNumber(v: string | null) {
    this.#vatNumber = v === null ? null : normaliseNullable(v, ["trim","nullEmptyToNull"] as const);
  }

  /**
   * Inline-named JSON. Emits to json-types/CustomerLanguageSettings.ts.
   */
  get languageSettings(): CustomerLanguageSettings {
    return this.#languageSettings;
  }
  set languageSettings(v: CustomerLanguageSettings) {
    this.#languageSettings = v;
  }

  /**
   * @remarks Prisma-assigned at insert time — reading on a freshly-constructed instance returns `undefined` until the row has been persisted (and `from()` has hydrated the value back, or Prisma has returned the populated row). The declared type is honest post-insert.
   */
  get createdAt(): Date {
    return this.#createdAt;
  }
  set createdAt(v: Date | string | number) {
    this.#createdAt = coerceDate(v, "Customer.createdAt");
  }

  get address(): Address | null {
    return this.#address;
  }
  set address(v: Address | null) {
    this.#address = v;
  }

  get orders(): Order[] {
    return this.#orders;
  }
  set orders(v: Order[]) {
    this.#orders = v;
  }

  constructor(init: CustomerInit) {
    for (const key of ["id", "email", "displayName", "tier", "internalSeq", "legacyExternalId", "vatNumber", "languageSettings", "createdAt", "address", "orders"] as const) {
      const desc = Object.getOwnPropertyDescriptor(Customer.prototype, key);
      if (desc) Object.defineProperty(this, key, { ...desc, enumerable: true });
    }

    this.email = init.email;
    this.displayName = init.displayName;
    this.tier = init.tier ?? CustomerTier.STANDARD;
    this.internalSeq = init.internalSeq ?? 0;
    if (init.legacyExternalId !== undefined) this.legacyExternalId = init.legacyExternalId;
    if (init.vatNumber !== undefined) this.vatNumber = init.vatNumber;
    this.languageSettings = init.languageSettings;
    if (init.address !== undefined) this.address = init.address;
    if (init.orders !== undefined) this.orders = init.orders;
  }

  /**
   * Hydrate Customer from an untrusted object shape (e.g. a JSON body
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
  static from(data: Record<string, unknown>): Customer {
    const initKeys = ["email", "displayName", "tier", "internalSeq", "legacyExternalId", "vatNumber", "languageSettings", "address", "orders"] as const;
    const init: Record<string, unknown> = {};
    for (const key of initKeys) {
      if (data[key] !== undefined) init[key] = data[key];
    }
    const instance = new Customer(init as unknown as CustomerInit);
    const assignKeys = ["id", "createdAt"] as const;
    for (const key of assignKeys) {
      if (data[key] !== undefined) {
        (instance as unknown as Record<string, unknown>)[key] = data[key];
      }
    }
    return instance;
  }

  /**
   * Fluent builder for Customer. One chainable method per init-writable
   * field; `.build()` calls the constructor (which fires the full setter
   * pipeline, including any required-field checks).
   */
  static builder(): CustomerBuilder {
    return new CustomerBuilder();
  }
}

export class CustomerBuilder {
  readonly #init: Partial<CustomerInit> = {};

  email(v: string): this {
    this.#init.email = v;
    return this;
  }

  displayName(v: string): this {
    this.#init.displayName = v;
    return this;
  }

  tier(v: CustomerTier): this {
    this.#init.tier = v;
    return this;
  }

  internalSeq(v: number): this {
    this.#init.internalSeq = v;
    return this;
  }

  legacyExternalId(v: string | number | boolean | bigint | null): this {
    this.#init.legacyExternalId = v;
    return this;
  }

  vatNumber(v: string | null): this {
    this.#init.vatNumber = v;
    return this;
  }

  languageSettings(v: CustomerLanguageSettings): this {
    this.#init.languageSettings = v;
    return this;
  }

  address(v: Address | null): this {
    this.#init.address = v;
    return this;
  }

  orders(v: Order[]): this {
    this.#init.orders = v;
    return this;
  }

  build(): Customer {
    return new Customer(this.#init as CustomerInit);
  }
}
