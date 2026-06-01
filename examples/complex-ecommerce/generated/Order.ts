import type { Decimal } from "@prisma/client/runtime/library";
import type { Customer } from "./Customer.js";
import type { Currency } from "./enums/Currency.js";
import type { FulfilmentMethod } from "./enums/FulfilmentMethod.js";
import type { OrderStatus } from "./enums/OrderStatus.js";
import type { OrderMetadata } from "./json-types/OrderMetadata.js";
import type { OrderItem } from "./OrderItem.js";

/**
 * Customer orders, the heart of the system.
 * Some legacy fields are kept for migration compatibility.
 */
export interface Order {
  id: bigint;
  customerId: string;
  customer: Customer;
  items: OrderItem[];
  /**
   * @db.Decimal(15, 2)
   */
  totalAmount: Decimal;
  /**
   * @db.Decimal(15, 2)
   */
  taxAmount: Decimal;
  /**
   * @db.Decimal(15, 2)
   */
  shippingAmount: Decimal;
  currency: Currency;
  status: OrderStatus;
  fulfilment: FulfilmentMethod;
  metadata: OrderMetadata | null;
  /**
   * @deprecated use orderReference instead; legacyOrderCode will be removed in 2026-12
   */
  legacyOrderCode: string | null;
  orderReference: string;
  createdAt: Date;
  updatedAt: Date;
}
