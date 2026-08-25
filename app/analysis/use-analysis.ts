"use client";

import { useEffect, useRef, useState } from "react";
import type { PlanInputs } from "../../lib/planner";
import { SLOW_PARTS, analysePart, analyseQuick, assemble, type Analysis, type SlowResults } from "./analyse";
import type { AnalysisRequest, AnalysisResponse } from "./worker";

type Job = { id: number; request: AnalysisRequest; resolve: (result: AnalysisResponse["result"]) => void };

/**
 * A small pool of workers so the three goal solvers and the backtests run at the same time.
 * Falls back to inline computation where workers are unavailable or die.
 */
class AnalysisPool {
  private workers: { worker: Worker; busy: boolean }[] = [];
  private queue: Job[] = [];
  private inFlight = new Map<number, { job: Job; slot: number }>();
  private nextId = 1;

  constructor(size: number) {
    if (typeof Worker === "undefined") return;
    for (let index = 0; index < size; index += 1) {
      try {
        const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
        const slot = this.workers.length;
        worker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
          const entry = this.inFlight.get(event.data.id);
          if (!entry) return;
          this.inFlight.delete(event.data.id);
          this.workers[slot]!.busy = false;
          entry.job.resolve(event.data.result);
          this.pump();
        };
        worker.onerror = () => {
          // This worker is gone: finish what it owed inline and stop using it.
          this.workers.splice(slot, 1);
          for (const [id, entry] of [...this.inFlight]) if (entry.slot === slot) { this.inFlight.delete(id); entry.job.resolve(runInline(entry.job.request)); }
          this.pump();
        };
        this.workers.push({ worker, busy: false });
      } catch {
        break;
      }
    }
  }

  run(request: Omit<AnalysisRequest, "id">): Promise<AnalysisResponse["result"]> {
    const id = this.nextId++;
    const full: AnalysisRequest = { ...request, id };
    if (this.workers.length === 0) return Promise.resolve(runInline(full));
    return new Promise((resolve) => { this.queue.push({ id, request: full, resolve }); this.pump(); });
  }

  private pump() {
    for (const [slot, entry] of this.workers.entries()) {
      if (entry.busy) continue;
      const job = this.queue.shift();
      if (!job) return;
      entry.busy = true;
      this.inFlight.set(job.id, { job, slot });
      entry.worker.postMessage(job.request);
    }
  }
}

function runInline(request: AnalysisRequest): AnalysisResponse["result"] {
  return request.part === "quick" ? analyseQuick(request.plan) : analysePart(request.plan, request.part);
}

let pool: AnalysisPool | null = null;
function getPool(): AnalysisPool {
  if (!pool) pool = new AnalysisPool(Math.max(1, Math.min(4, (typeof navigator !== "undefined" ? navigator.hardwareConcurrency ?? 2 : 2) - 1)));
  return pool;
}

/**
 * Analyse a plan off the main thread. Returns the last completed result (so the page never
 * flashes empty) and whether a newer one is in flight. Pass `null` to skip work; `quick`
 * skips the solvers and backtests.
 */
export function useAnalysis(plan: PlanInputs | null, delayMs = 250, quick = false): { result: Analysis | null; pending: boolean } {
  // The result remembers which inputs produced it; "pending" is derived, not stored, so no
  // state is written inside the effect.
  const [state, setState] = useState<{ plan: PlanInputs | null; result: Analysis | null }>({ plan: null, result: null });
  const latest = useRef(0);

  useEffect(() => {
    if (plan === null) return;
    const token = ++latest.current;
    const timer = window.setTimeout(() => {
      const runner = getPool();
      const fast = runner.run({ plan, part: "quick" }) as Promise<Analysis>;
      const slow = quick ? null : Promise.all(SLOW_PARTS.map((part) => runner.run({ plan, part }))) as Promise<[SlowResults["earliestAge"], SlowResults["extraSaving"], SlowResults["spending"], SlowResults["backtests"]]>;
      fast.then((preview) => {
        if (token !== latest.current) return;
        if (!slow) { setState({ plan, result: preview }); return; }
        // Paint the verdict now; keep the previous plan's solver answers (dimmed by the page) until the new ones land.
        setState((current) => ({ plan, result: { ...preview, goals: current.result?.goals ?? null, backtests: current.result?.backtests ?? null, preview: true } }));
      });
      if (slow) Promise.all([fast, slow]).then(([preview, [earliestAge, extraSaving, spending, backtests]]) => {
        if (token === latest.current) setState({ plan, result: assemble(plan, preview, { earliestAge, extraSaving, spending, backtests }) });
      });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [plan, delayMs, quick]);

  const pending = plan !== null && (state.plan !== plan || state.result?.preview === true);
  return { result: plan === null ? null : state.result, pending };
}
