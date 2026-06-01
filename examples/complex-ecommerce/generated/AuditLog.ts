import type { AuditPayload } from "./json-types/AuditPayload.js";

/**
 * Audit log of sensitive actions. PII fields are hidden from the generated
 * types but stored in the database for compliance.
 */
export interface AuditLog {
  id: bigint;
  action: string;
  payload: AuditPayload;
  timestamp: Date;
}
