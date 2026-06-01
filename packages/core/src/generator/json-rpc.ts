// Minimal JSON-RPC handler for the Prisma generator protocol.
//
// Prisma launches our binary, sends newline-delimited JSON-RPC requests over
// stdin, expects newline-delimited responses on STDERR (yes, stderr — this is
// a Prisma-specific quirk that's easy to miss: see @prisma/generator-helper's
// implementation). Two methods only:
//   - `getManifest` — generator describes itself
//   - `generate`    — generator does the codegen work
//
// Vendored intentionally (~80 lines) so @omniprism/* packages have zero
// third-party runtime deps. If Prisma changes the protocol in the future,
// this is the single file to update.

import { createInterface } from "node:readline";

interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: unknown;
  readonly id: number | string;
}

interface JsonRpcResponse {
  readonly jsonrpc: "2.0";
  readonly id: number | string;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string };
}

export interface JsonRpcHandlers {
  readonly getManifest: () => unknown | Promise<unknown>;
  readonly generate: (params: unknown) => void | Promise<void>;
}

export function runJsonRpc(handlers: JsonRpcHandlers): void {
  const rl = createInterface({
    input: process.stdin,
    terminal: false,
    crlfDelay: Infinity,
  });

  rl.on("line", (line) => {
    void handleLine(line, handlers);
  });

  rl.on("close", () => {
    process.exit(0);
  });

  // Prisma's reference implementation explicitly resumes stdin; mirror that
  // to avoid edge cases where readline doesn't auto-resume.
  process.stdin.resume();
}

async function handleLine(line: string, handlers: JsonRpcHandlers): Promise<void> {
  const trimmed = line.trim();
  if (trimmed.length === 0) return;

  let req: JsonRpcRequest;
  try {
    req = JSON.parse(trimmed) as JsonRpcRequest;
  } catch {
    process.stderr.write(`OmniPrism: failed to parse JSON-RPC request: ${trimmed}\n`);
    return;
  }

  try {
    if (req.method === "getManifest") {
      const result = await handlers.getManifest();
      respondResult(req.id, result);
    } else if (req.method === "generate") {
      await handlers.generate(req.params);
      respondResult(req.id, null);
    } else {
      respondError(req.id, -32601, `Method not found: ${req.method}`);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    respondError(req.id, -32603, message);
  }
}

// Prisma reads responses from STDERR. Writing to stdout would deadlock.
function respondResult(id: number | string, result: unknown): void {
  const response: JsonRpcResponse = { jsonrpc: "2.0", id, result };
  process.stderr.write(`${JSON.stringify(response)}\n`);
}

function respondError(id: number | string, code: number, message: string): void {
  const response: JsonRpcResponse = {
    jsonrpc: "2.0",
    id,
    error: { code, message },
  };
  process.stderr.write(`${JSON.stringify(response)}\n`);
}
