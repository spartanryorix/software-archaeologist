import type { AnalyzerProvider } from "../types";
import { MockAnalyzer } from "./mockAnalyzer";
import { RemoteAnalyzer, lastAnalysisInfo } from "./remoteAnalyzer";

/**
 * Single place where the analyzer is chosen.
 *
 * RemoteAnalyzer = deterministic MockAnalyzer baseline (works offline) refined by
 * Vultr Serverless Inference through the backend's /api/analyze. If the backend is
 * unreachable the baseline is returned unchanged.
 */
export const analyzer: AnalyzerProvider = new RemoteAnalyzer(new MockAnalyzer());

export { MockAnalyzer, lastAnalysisInfo };
