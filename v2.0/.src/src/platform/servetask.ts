// serveTask: the worker side of every worker-backed task, the same for all (replacing each worker's own serve()). The worker's scope (given, so it can be tested) gets one message
// handler: a ping is answered at once with { type: "pong" } (Workers.start waits for it, and takes no worker without it), any other message goes to handle(state, message), whose
// reply is posted (with its transfer list), the state being made by create() at the first message that is not a ping; a handler that throws, or a promise it returned that rejects,
// is reported as { type: "failed", error } (the task's wrapper then calls the worker lost: the task runs inline and tries again), never left silent.
//
// Changelog:
// 2026-11-10: new.
import { M } from "../engine/core";

type Message = Record<string, unknown>;

export interface TaskScope {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror?: unknown;
  postMessage(message: Message, transfer?: Transferable[] | unknown[]): void;
}

export type TaskAnswer = { reply: Message; transfer: Transferable[] | unknown[] } | null | undefined;

export function serveTask<S>(scope: TaskScope, create: () => S, handle: (state: S, message: Message) => TaskAnswer): void {
  let state: S | null = null;
  let made = false;
  const failed = (error: unknown): void => {
    scope.postMessage({ type: "failed", error: String((error && (error as Error).message) || error) });
  };
  scope.onmessage = (event) => {
    const message = event.data as Message;
    if (message && message.type === "ping") {
      scope.postMessage({ type: "pong" });
      return;
    }
    try {
      if (!made) {
        state = create();
        made = true;
      }
      const answer = handle(state as S, message);
      if (answer) {
        scope.postMessage(answer.reply, answer.transfer);
      }
    } catch (error) {
      failed(error);
    }
  };
}

M.serveTask = serveTask;
