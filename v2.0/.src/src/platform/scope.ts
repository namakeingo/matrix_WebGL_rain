// A dedicated worker's own scope, as the wallpaper's workers use it (the page's types know only a
// window's self): its messages to the page that made it, its name (which part of the wallpaper it
// runs: src/index.ts), and the page's messages to it.

export interface WorkerScope {
  name: string;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

// whether this script runs in a worker (no page)
export const inWorker = (): boolean => typeof document === "undefined";

export const workerScope = (): WorkerScope => self as unknown as WorkerScope;
