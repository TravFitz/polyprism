import type { Customer } from "./Customer.js";

export interface Address {
  id: string;
  customerId: string;
  customer: Customer;
  streetLine1: string;
  streetLine2: string | null;
  city: string;
  state: string | null;
  postalCode: string;
  /**
   * @db.VarChar(2)
   */
  countryCode: string;
  isPrimary: boolean;
  createdAt: Date;
}
