import type { PlanInputs } from "../../lib/planner";
import { analysePart, analyseQuick, type Analysis, type SlowPart, type SlowResults } from "./analyse";

export type AnalysisRequest = { id: number; plan: PlanInputs; part: "quick" | SlowPart };
export type AnalysisResponse = { id: number; result: Analysis | SlowResults[SlowPart] };

self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  const { id, plan, part } = event.data;
  const result = part === "quick" ? analyseQuick(plan) : analysePart(plan, part);
  const response: AnalysisResponse = { id, result };
  self.postMessage(response);
};
