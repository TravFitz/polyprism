import type { Address } from "./Address.js";
import type { Order } from "./Order.js";

/**
 * Top-level customer of the store.
 */
export interface Customer {
  id: string;
  email: string;
  phoneNumber: string | null;
  dateOfBirth: Date | null;
  addresses: Address[];
  orders: Order[];
  createdAt: Date;
  updatedAt: Date;
}
