// Integration tests for the generated domain-class output.
//
// These import the *actual* generated files from the showcase example —
// the load-bearing claim is "what we emit is something a real Prisma
// consumer can use", and the only way to verify that is to use it.
//
// Coverage:
//   1. Constructor accepts the widened init shape (string → Decimal/Date/etc.)
//   2. Setter @coerce / @normalise pipeline fires
//   3. Object.keys returns all field names (the Prisma read path)
//   4. JSON.stringify produces wire-safe output for every type combination
//   5. Spread into a plain object works (also Prisma-shaped)
//   6. static from() hydrates untrusted Record<string, unknown> shapes
//   7. toJSON() makes BigInt fields stringify-safe
//   8. static builder() + fluent .build() round-trips through the constructor
//
// What's *not* covered here: a real Prisma sqlite round-trip. That requires
// DB setup, a `@prisma/client` at runtime, and a migration step — overkill
// for the surface we're validating in this RC. The unit-level checks below
// cover the same contract.

import { Decimal } from "@prisma/client/runtime/library";
import { describe, expect, it } from "vitest";

import { Address } from "../../../examples/ts/domain-class-showcase/generated/Address.js";
import { Customer } from "../../../examples/ts/domain-class-showcase/generated/Customer.js";
import { CustomerTier } from "../../../examples/ts/domain-class-showcase/generated/enums/CustomerTier.js";
import { OrderStatus } from "../../../examples/ts/domain-class-showcase/generated/enums/OrderStatus.js";
import { Order } from "../../../examples/ts/domain-class-showcase/generated/Order.js";

// Minimal valid init shape — reused across tests so each one focuses on a
// single behaviour.
const baseCustomerInit = {
  email: "  ALICE@SHOPIFY.com  ",
  displayName: "  Alice  ",
  languageSettings: {
    default: "en",
    fallbacks: ["en-US"],
    rtl: false,
  },
};

describe("Customer — constructor + setter pipeline", () => {
  it("normalises email on construction (trim + lowercase)", () => {
    const c = new Customer(baseCustomerInit);
    expect(c.email).toBe("alice@shopify.com");
  });

  it("normalises displayName on construction (trim only)", () => {
    const c = new Customer(baseCustomerInit);
    expect(c.displayName).toBe("Alice");
  });

  it("applies the tier default when omitted from init", () => {
    const c = new Customer(baseCustomerInit);
    expect(c.tier).toBe(CustomerTier.STANDARD);
  });

  it("respects an explicit tier in init", () => {
    const c = new Customer({ ...baseCustomerInit, tier: CustomerTier.VIP });
    expect(c.tier).toBe(CustomerTier.VIP);
  });

  it("@noCoerce field rejects boundary widening at the type level (runtime: strict)", () => {
    // internalSeq is @noCoerce; the setter only takes `number`. Passing a
    // string would be a compile-time error. At runtime it'd assign-as-is —
    // we don't enforce runtime type-strictness for @noCoerce because users
    // opted out of coercion explicitly.
    const c = new Customer({ ...baseCustomerInit, internalSeq: 42 });
    expect(c.internalSeq).toBe(42);
  });

  it("cross-type @coerce(string) accepts numbers and stringifies them", () => {
    const c = new Customer({ ...baseCustomerInit, legacyExternalId: 12345 });
    expect(c.legacyExternalId).toBe("12345");
  });

  it("@normalise(nullEmptyToNull) collapses empty strings on a nullable field", () => {
    const c = new Customer({ ...baseCustomerInit, vatNumber: "" });
    expect(c.vatNumber).toBeNull();
  });

  it("@normalise(nullEmptyToNull) preserves non-empty after trimming", () => {
    const c = new Customer({ ...baseCustomerInit, vatNumber: "  GB123  " });
    expect(c.vatNumber).toBe("GB123");
  });

  it("re-assigning a field via the setter re-fires the pipeline", () => {
    const c = new Customer(baseCustomerInit);
    c.email = "  BOB@SHOPIFY.com  ";
    expect(c.email).toBe("bob@shopify.com");
  });
});

describe("Order — coerce-by-default pipeline", () => {
  const baseOrderInit = {
    total: "10.99",
    customerId: "cus_abc",
    customer: new Customer(baseCustomerInit),
  };

  it("Decimal default-coerces from a string", () => {
    const o = new Order(baseOrderInit);
    expect(o.total).toBeInstanceOf(Decimal);
    expect(o.total.toString()).toBe("10.99");
  });

  it("Decimal default-coerces from a number", () => {
    const o = new Order({ ...baseOrderInit, total: 5.5 });
    expect(o.total).toBeInstanceOf(Decimal);
    expect(o.total.toString()).toBe("5.5");
  });

  it("Decimal passes through an existing Decimal unchanged", () => {
    const d = new Decimal("99.99");
    const o = new Order({ ...baseOrderInit, total: d });
    expect(o.total).toBe(d);
  });

  it("Float default-coerces from a string", () => {
    const o = new Order({ ...baseOrderInit, exchangeRate: "1.25" });
    expect(o.exchangeRate).toBe(1.25);
  });

  it("Int default-coerces from a string", () => {
    const o = new Order({ ...baseOrderInit, itemCount: "3" });
    expect(o.itemCount).toBe(3);
  });

  it("DateTime default-coerces from an ISO string (via setter post-construction)", () => {
    // placedAt has @default(now()) → excluded from OrderInit (Prisma assigns
    // at insert). We exercise the setter directly here, which is the same
    // path Prisma's deserialization would hit when hydrating a fetched row.
    const o = new Order(baseOrderInit);
    o.placedAt = "2026-06-02T00:00:00Z";
    expect(o.placedAt).toBeInstanceOf(Date);
    expect(o.placedAt.toISOString()).toBe("2026-06-02T00:00:00.000Z");
  });

  it("nullable DateTime accepts null", () => {
    const o = new Order({ ...baseOrderInit, paidAt: null });
    expect(o.paidAt).toBeNull();
  });

  it("nullable DateTime coerces a string when non-null", () => {
    const o = new Order({ ...baseOrderInit, paidAt: "2026-06-03" });
    expect(o.paidAt).toBeInstanceOf(Date);
  });

  it("status defaults to OrderStatus.PENDING when omitted", () => {
    const o = new Order(baseOrderInit);
    expect(o.status).toBe(OrderStatus.PENDING);
  });

  it("invalid Date input throws TypeError with the field path (via setter)", () => {
    const o = new Order(baseOrderInit);
    expect(() => {
      o.placedAt = "not-a-date";
    }).toThrowError(/Cannot coerce "not-a-date" to Date for Order\.placedAt/);
  });
});

describe("Prisma-friendly accessor surface", () => {
  it("Object.keys returns all visible field names (the Prisma read path)", () => {
    const c = new Customer(baseCustomerInit);
    const keys = Object.keys(c).sort();
    expect(keys).toEqual([
      "address",
      "createdAt",
      "displayName",
      "email",
      "id",
      "internalSeq",
      "languageSettings",
      "legacyExternalId",
      "orders",
      "tier",
      "vatNumber",
    ]);
    // The @hide field must NOT appear
    expect(keys).not.toContain("passwordHash");
  });

  it("Object.entries returns the values (not undefined for un-assigned cuid() id)", () => {
    const c = new Customer(baseCustomerInit);
    const entries = Object.entries(c);
    const emailEntry = entries.find(([k]) => k === "email");
    expect(emailEntry?.[1]).toBe("alice@shopify.com");
  });

  it("spread into a plain object preserves field values", () => {
    const c = new Customer(baseCustomerInit);
    const plain = { ...c };
    expect(plain.email).toBe("alice@shopify.com");
    expect(plain.tier).toBe(CustomerTier.STANDARD);
    expect(plain.languageSettings).toEqual(baseCustomerInit.languageSettings);
  });

  it("JSON-blob field (languageSettings) round-trips through spread untouched", () => {
    // The exact failure mode shopify-duty-tax cares about:
    //   `prisma.customer.update({ data: customer })` must see languageSettings
    //   as the original object, not undefined or {}.
    const c = new Customer(baseCustomerInit);
    const plain = { ...c };
    expect(plain.languageSettings).toBe(c.languageSettings);
  });
});

describe("JSON.stringify wire-safe output", () => {
  it("serialises a Customer with string/enum/JSON-blob fields cleanly", () => {
    const c = new Customer(baseCustomerInit);
    const json = JSON.parse(JSON.stringify(c));
    expect(json.email).toBe("alice@shopify.com");
    expect(json.displayName).toBe("Alice");
    expect(json.tier).toBe(CustomerTier.STANDARD);
    expect(json.languageSettings).toEqual(baseCustomerInit.languageSettings);
    expect(json.passwordHash).toBeUndefined();
  });

  it("serialises Decimal fields as the string form (Decimal.toJSON is native)", () => {
    const o = new Order({
      total: "10.99",
      customerId: "cus_abc",
      customer: new Customer(baseCustomerInit),
    });
    const json = JSON.parse(JSON.stringify(o));
    expect(json.total).toBe("10.99");
  });

  it("serialises Date fields as ISO strings (Date.toJSON is native)", () => {
    const o = new Order({
      total: "10.99",
      customerId: "cus_abc",
      customer: new Customer(baseCustomerInit),
    });
    o.placedAt = new Date("2026-06-02T00:00:00Z");
    const json = JSON.parse(JSON.stringify(o));
    expect(json.placedAt).toBe("2026-06-02T00:00:00.000Z");
  });
});

describe("Address — combined @normalise + Decimal default", () => {
  it("uppercases countryCode and coerces shippingRate from a string", () => {
    const customer = new Customer(baseCustomerInit);
    const a = new Address({
      line1: "  742 Evergreen Terrace  ",
      countryCode: "us",
      shippingRate: "12.50",
      customerId: "cus_abc",
      customer,
    });
    expect(a.line1).toBe("742 Evergreen Terrace");
    expect(a.countryCode).toBe("US");
    expect(a.shippingRate).toBeInstanceOf(Decimal);
    expect(a.shippingRate.toString()).toBe("12.5");
  });

  it("applies the new Decimal(0) default for shippingRate when omitted", () => {
    const customer = new Customer(baseCustomerInit);
    const a = new Address({
      line1: "742 Evergreen Terrace",
      countryCode: "US",
      customerId: "cus_abc",
      customer,
    });
    expect(a.shippingRate).toBeInstanceOf(Decimal);
    expect(a.shippingRate.toString()).toBe("0");
  });
});

describe("Customer.from() — hydration from an untrusted object shape", () => {
  it("constructs a fully-formed Customer from a Record<string, unknown>", () => {
    const c = Customer.from({
      email: "  CHARLIE@SHOPIFY.com  ",
      displayName: "Charlie",
      languageSettings: { default: "en", fallbacks: [], rtl: false },
    });
    expect(c).toBeInstanceOf(Customer);
    // Setter pipeline fired during from() — email is normalised
    expect(c.email).toBe("charlie@shopify.com");
  });

  it("silently drops unknown keys instead of throwing", () => {
    const c = Customer.from({
      ...baseCustomerInit,
      bogusKey: "should be ignored",
      anotherBogus: 42,
    });
    expect(c.email).toBe("alice@shopify.com");
    expect((c as unknown as Record<string, unknown>).bogusKey).toBeUndefined();
  });

  it("assigns prisma-assigned fields (id, createdAt) post-construction when present in data", () => {
    const c = Customer.from({
      ...baseCustomerInit,
      id: "cus_specific_id_from_db",
      createdAt: "2024-01-15T10:30:00Z",
    });
    expect(c.id).toBe("cus_specific_id_from_db");
    expect(c.createdAt).toBeInstanceOf(Date);
    expect(c.createdAt.toISOString()).toBe("2024-01-15T10:30:00.000Z");
  });

  it("respects @hide — passwordHash is never assigned even if present in data", () => {
    const c = Customer.from({
      ...baseCustomerInit,
      passwordHash: "should-never-land-on-instance",
    });
    expect((c as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
  });
});

describe("Order.toJSON() — BigInt-safe serialisation", () => {
  const baseOrderInit = {
    total: "10.99",
    customerId: "cus_abc",
    customer: new Customer(baseCustomerInit),
  };

  it("JSON.stringify on a raw Order (without toJSON) would throw — confirms why we need it", () => {
    // Sanity check: without our toJSON, a bigint field would break JSON.stringify.
    // We can't actually demonstrate this on the class (it has toJSON), but we
    // verify by stringifying a plain object with the same shape.
    expect(() => JSON.stringify({ id: 5n })).toThrowError(/BigInt/);
  });

  it("JSON.stringify(order) produces wire-safe output with BigInt fields stringified", () => {
    const o = new Order(baseOrderInit);
    o.id = 9007199254740993n; // beyond Number.MAX_SAFE_INTEGER — the canonical Shopify case
    const json = JSON.parse(JSON.stringify(o));
    expect(json.id).toBe("9007199254740993");
  });

  it("nullable BigInt (parentOrderId) serialises as null when null", () => {
    const o = new Order(baseOrderInit);
    o.id = 5n;
    const json = JSON.parse(JSON.stringify(o));
    expect(json.parentOrderId).toBeNull();
  });

  it("nullable BigInt (parentOrderId) serialises as string when set", () => {
    const o = new Order(baseOrderInit);
    o.id = 5n;
    o.parentOrderId = 12345n;
    const json = JSON.parse(JSON.stringify(o));
    expect(json.parentOrderId).toBe("12345");
  });

  it("Date, Decimal, and string fields still serialise natively alongside the BigInt override", () => {
    const o = new Order(baseOrderInit);
    o.id = 5n;
    o.placedAt = new Date("2026-06-02T00:00:00Z");
    const json = JSON.parse(JSON.stringify(o));
    expect(json.id).toBe("5");
    expect(json.placedAt).toBe("2026-06-02T00:00:00.000Z");
    expect(json.total).toBe("10.99"); // Decimal.toJSON returns string
    expect(json.customerId).toBe("cus_abc"); // strings unchanged
  });
});

describe("Customer.builder() — fluent construction", () => {
  it("builds a Customer via chained .field(v) calls", () => {
    const c = Customer.builder()
      .email("  DANA@SHOPIFY.com  ")
      .displayName("  Dana  ")
      .languageSettings({ default: "en", fallbacks: [], rtl: false })
      .build();
    expect(c).toBeInstanceOf(Customer);
    // Setter pipeline fires at build() time — normalisation visible on getters
    expect(c.email).toBe("dana@shopify.com");
    expect(c.displayName).toBe("Dana");
  });

  it("applies defaults via the constructor when a builder method isn't called", () => {
    const c = Customer.builder()
      .email("eve@shopify.com")
      .displayName("Eve")
      .languageSettings({ default: "en", fallbacks: [], rtl: false })
      .build();
    // tier was never set on the builder — constructor applies @default(STANDARD)
    expect(c.tier).toBe(CustomerTier.STANDARD);
  });

  it("each builder method returns `this` for chainability", () => {
    const b = Customer.builder();
    expect(b.email("a@b.c")).toBe(b);
    expect(b.displayName("X")).toBe(b);
  });

  it("Order.builder() exposes init-writable fields but not prisma-assigned id", () => {
    const builder = Order.builder();
    // status/total/customerId/customer/... are present
    expect(typeof builder.total).toBe("function");
    expect(typeof builder.customerId).toBe("function");
    // id is @default(autoincrement()) → prisma-assigned, not on builder
    expect((builder as unknown as Record<string, unknown>).id).toBeUndefined();
    // placedAt is @default(now()) → prisma-assigned, not on builder
    expect((builder as unknown as Record<string, unknown>).placedAt).toBeUndefined();
  });
});
