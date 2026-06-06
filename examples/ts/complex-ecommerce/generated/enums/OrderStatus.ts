export enum OrderStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  /**
   * @deprecated collapsed into REFUNDED in 2026-04
   */
  PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED",
  REFUNDED = "REFUNDED",
  FAILED = "FAILED",
}
