import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface LspDiagnostic {
  code: string | number;
  message: string;
  range: { start: { line: number; character: number } };
}

/** Flatten an LSP Hover `contents` (string | MarkupContent | MarkedString[]) to plain text. */
function renderHover(contents: unknown): string {
  if (!contents) return "";
  if (typeof contents === "string") return contents;
  if (Array.isArray(contents)) return contents.map(renderHover).join("\n");
  const c = contents as { value?: string };
  return c.value ?? "";
}

/** A tiny stdio LSP client — just enough to drive the server in tests. */
export class LspClient {
  private child: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private pending = new Map<number, (result: unknown) => void>();
  private buffer = Buffer.alloc(0);
  private diagnostics = new Map<string, LspDiagnostic[]>();

  constructor() {
    this.child = spawn("node", [path.join(root, "dist", "language-server.js"), "--stdio"], {
      stdio: ["pipe", "pipe", "ignore"],
    });
    this.child.stdout.on("data", (chunk: Buffer) => this.onData(chunk));
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      const header = this.buffer.subarray(0, headerEnd).toString("ascii");
      const match = /Content-Length: (\d+)/i.exec(header);
      if (!match) break;
      const len = Number(match[1]);
      const start = headerEnd + 4;
      if (this.buffer.length < start + len) break;
      const body = this.buffer.subarray(start, start + len).toString("utf8");
      this.buffer = this.buffer.subarray(start + len);
      this.dispatch(JSON.parse(body));
    }
  }

  private dispatch(msg: {
    id?: number;
    method?: string;
    result?: unknown;
    params?: { uri: string; diagnostics: LspDiagnostic[] };
  }): void {
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      this.pending.get(msg.id)!(msg.result);
      this.pending.delete(msg.id);
    } else if (msg.method === "textDocument/publishDiagnostics" && msg.params) {
      this.diagnostics.set(msg.params.uri, msg.params.diagnostics);
    }
  }

  private write(msg: Record<string, unknown>): void {
    const body = JSON.stringify({ jsonrpc: "2.0", ...msg });
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.write({ id, method, params });
    });
  }

  notify(method: string, params: unknown): void {
    this.write({ method, params });
  }

  /** initialize + initialized against a project directory. */
  async start(projectDir: string): Promise<void> {
    const rootUri = pathToFileURL(projectDir).href;
    await this.request("initialize", {
      processId: process.pid,
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: path.basename(projectDir) }],
      capabilities: { textDocument: { publishDiagnostics: {} } },
      initializationOptions: {
        typescript: { tsdk: path.join(root, "node_modules", "typescript", "lib"), enabled: true },
      },
    });
    this.notify("initialized", {});
  }

  openMdx(file: string, text: string): string {
    const uri = pathToFileURL(file).href;
    this.notify("textDocument/didOpen", {
      textDocument: { uri, languageId: "mdx", version: 1, text },
    });
    return uri;
  }

  /** Hover at a position, polling until the language service warms up (or times out). */
  async hover(
    uri: string,
    position: { line: number; character: number },
    timeoutMs = 20_000,
  ): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const res = (await this.request("textDocument/hover", {
        textDocument: { uri },
        position,
      })) as { contents?: unknown } | null;
      const text = renderHover(res?.contents);
      if (text || Date.now() > deadline) return text;
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  /** Completion labels at a position, polling until non-empty (or timeout). */
  async completionLabels(
    uri: string,
    position: { line: number; character: number },
    timeoutMs = 20_000,
  ): Promise<string[]> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const res = (await this.request("textDocument/completion", {
        textDocument: { uri },
        position,
        context: { triggerKind: 1 },
      })) as { items?: { label: string }[] } | { label: string }[] | null;
      const items = Array.isArray(res) ? res : (res?.items ?? []);
      if (items.length > 0 || Date.now() > deadline) return items.map((i) => i.label);
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  /** Wait for the next non-empty diagnostics for a uri (or return [] on timeout). */
  async waitForDiagnostics(uri: string, timeoutMs = 25_000): Promise<LspDiagnostic[]> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const d = this.diagnostics.get(uri);
      if (d && d.length > 0) return d;
      await new Promise((r) => setTimeout(r, 150));
    }
    return this.diagnostics.get(uri) ?? [];
  }

  /** Wait briefly and return whatever diagnostics have arrived (possibly empty). */
  async settle(uri: string, ms = 4_000): Promise<LspDiagnostic[]> {
    await new Promise((r) => setTimeout(r, ms));
    return this.diagnostics.get(uri) ?? [];
  }

  stop(): void {
    this.child.kill();
  }
}
