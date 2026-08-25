import type { PlanInputs } from "../../lib/planner";
import { analyse } from "./analyse";

export type AnalysisRequest = { id: number; plan: PlanInputs; quick: boolean };
export type AnalysisResponse = { id: number; result: ReturnType<typeof analyse> };

self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  const { id, plan, quick } = event.data;
  const response: AnalysisResponse = { id, result: analyse(plan, quick) };
  self.postMessage(response);
};
