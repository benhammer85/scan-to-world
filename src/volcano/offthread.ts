/**
 * Work sent off the page's own thread, with a way back if it can't be: some pages (sandboxed
 * frames, strict content policies) may not start a worker, and then the same work is done here,
 * a little later, so the world is only less smooth, never broken.
 *
 * Until the worker has said it's running, what's sent is copied rather than handed over, so that
 * if it never starts, what was sent can be done here instead.
 */
export type Handler = (ask: unknown, reply: (msg: unknown, transfer?: Transferable[]) => void) => void;

export interface OffThread {
  post(msg: unknown, transfer?: Transferable[]): void;
  onmessage: ((data: unknown) => void) | null;
}

export function offThread(make: () => Worker, handle: Handler): OffThread {
  const out: OffThread = { post: () => {}, onmessage: null };
  let worker: Worker | null = null, ready = false;
  const sent: unknown[] = [];
  const local = () => {
    worker = null;
    out.post = (msg) => setTimeout(() => handle(msg, (m) => out.onmessage?.(m)), 0);
    for (const m of sent.splice(0)) out.post(m);
  };
  try {
    worker = make();
    worker.onmessage = (e: MessageEvent) => {
      if (e.data === 'ready') { ready = true; sent.length = 0; return; }
      out.onmessage?.(e.data);
    };
    worker.onerror = () => { if (!ready) local(); };
    out.post = (msg, transfer) => {
      if (!worker) return out.post(msg);
      if (ready) worker.postMessage(msg, transfer ?? []);
      else { sent.push(msg); worker.postMessage(msg); }
    };
  } catch {
    local();
  }
  return out;
}

/** In a worker: answer with `handle`, and say it's running. */
export function serve(handle: Handler): void {
  const scope = self as unknown as { postMessage(m: unknown, t?: Transferable[]): void; onmessage: ((e: MessageEvent) => void) | null };
  scope.onmessage = (e) => handle(e.data, (m, t) => scope.postMessage(m, t ?? []));
  scope.postMessage('ready');
}
