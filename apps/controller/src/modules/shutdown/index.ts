import type { Storage } from '../storage/index.js';

interface Dependencies {
  storage: Pick<Storage, 'getShutdown' | 'commitShutdown' | 'controllerInstanceId'>;
  close(): Promise<void>;
  reportFailure(): void;
}

/** The token is armed only after the command's HTTP response has been sent. */
export function createShutdownCoordinator(deps: Dependencies) {
  let stopped = false;
  let closing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let token: { operationId: string; generation: number; instanceId: string } | null = null;
  function schedule() {
    if (timer || stopped || closing || !token) return;
    const scheduledToken = token;
    const scheduledTimer = setTimeout(() => {
      if (timer !== scheduledTimer) return;
      timer = undefined;
      poll(scheduledToken);
    }, 100);
    timer = scheduledTimer;
    timer.unref();
  }
  function poll(scheduledToken: NonNullable<typeof token>) {
    if (stopped || closing || token !== scheduledToken) return;
    try {
      const view = deps.storage.getShutdown();
      if (view.operation_id !== scheduledToken.operationId || view.generation !== scheduledToken.generation || view.closing_committed || !view.starts_paused) { token = null; return; }
      if (deps.storage.commitShutdown(scheduledToken)) {
        closing = true;
        void deps.close().catch(deps.reportFailure);
        return;
      }
    } catch { deps.reportFailure(); }
    schedule();
  }
  return {
    follow(operationId: string) {
      if (stopped || closing) return;
      const view = deps.storage.getShutdown();
      if (!view.starts_paused || view.operation_id !== operationId || !['draining','ready_to_close','blocked'].includes(view.state)) return;
      if (timer) clearTimeout(timer);
      timer = undefined;
      token = { operationId, generation: view.generation, instanceId: deps.storage.controllerInstanceId };
      schedule();
    },
    stop() { stopped = true; token = null; if (timer) clearTimeout(timer); timer = undefined; },
  };
}
