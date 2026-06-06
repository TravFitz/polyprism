import type { JsonValue } from "@prisma/client/runtime/library";

/**
 * @deprecated migrated to new analytics pipeline 2026-03; will be removed
 */
export interface LegacyAnalyticsSnapshot {
  id: bigint;
  capturedAt: Date;
  metricKey: string;
  metricValue: number;
  dimensions: JsonValue | null;
}
