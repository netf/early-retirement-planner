"use client";

import { useEffect, useRef, useState } from "react";
import type { PlanInputs } from "../../lib/planner";
import { analyse, type Analysis } from "./analyse";
import type { AnalysisRequest, AnalysisResponse } from "./worker";

type Pending = { id: number; plan: PlanInputs; quick: boolean; resolve: (result: Analysis) => void };

/** One shared worker for the page; falls back to inline computation where workers are unavailable. */
class AnalysisClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    if (typeof Worker !== "undefined") {
      try {
        this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
        this.worker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
          const entry = this.pending.get(event.data.id);
          if (entry) { this.pending.delete(event.data.id); entry.resolve(event.data.result); }
        };
        this.worker.onerror = () => {
          // The worker is gone: finish whatever it owed us inline, then stay inline for good.
          this.worker = null;
          const owed = [...this.pending.values()];
          this.pending.clear();
          for (const entry of owed) entry.resolve(analyse(entry.plan, entry.quick));
        };
      } catch {
        this.worker = null;
      }
    }
  }

  run(plan: PlanInputs, quick: boolean): Promise<Analysis> {
    if (!this.worker) return Promise.resolve(analyse(plan, quick));
    const id = this.nextId++;
    const request: AnalysisRequest = { id, plan, quick };
    return new Promise((resolve) => {
      this.pending.set(id, { id, plan, quick, resolve });
      this.worker!.postMessage(request);
    });
  }
}

let client: AnalysisClient | null = null;
function getClient(): AnalysisClient {
  if (!client) client = new AnalysisClient();
  return client;
}

/**
 * Analyse a plan off the main thread. Returns the last completed result (so the page never
 * flashes empty) and whether a newer one is in flight. Pass `null` to skip work.
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
      const client = getClient();
      if (!quick) {
        // Fast first: the Monte Carlo alone paints the verdict in about a second; the solvers follow.
        client.run(plan, true).then((preview) => {
          if (token === latest.current) setState((current) => current.plan === plan ? current : { plan, result: { ...preview, goals: current.result?.goals ?? null, backtests: current.result?.backtests ?? null, preview: true } });
        });
      }
      client.run(plan, quick).then((analysis) => {
        if (token === latest.current) setState({ plan, result: analysis });
      });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [plan, delayMs, quick]);

  const pending = plan !== null && (state.plan !== plan || state.result?.preview === true);
  return { result: plan === null ? null : state.result, pending };
}
