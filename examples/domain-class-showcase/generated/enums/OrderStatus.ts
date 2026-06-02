export enum OrderStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  FULFILLED = "FULFILLED",
  CANCELLED = "CANCELLED",
  /**
   * @deprecated merge into CANCELLED; the previous distinction is no longer tracked
   */
  REFUNDED = "REFUNDED",
}
