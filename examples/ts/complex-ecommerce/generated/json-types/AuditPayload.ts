export type AuditPayload = {
  actor: string;
  kind: string;
  ts: number;
  target: {
    kind: string;
    id: string;
  };
  before: unknown;
  after: unknown;
};
