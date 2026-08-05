/**
 * Synthetic capacity telemetry for the telemetry overlay.
 *
 * No live metrics exist in this browser-only tool, so each node gets a stable,
 * deterministic "reading" derived from its id. This lets users visualize and
 * tune capacity-based routing (latency / error budget / throughput) on the
 * canvas without pretending the numbers are real.
 */
export interface NodeMetrics {
  latencyP95Ms: number;
  errorRatePct: number;
  budgetUsedPct: number;
  tokensPerMin: number;
  status: 'healthy' | 'degraded' | 'down';
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function nodeMetrics(seed: string): NodeMetrics {
  const h = hash(seed);
  const a = (h % 1000) / 10; // 0..100
  const b = ((h >> 10) % 1000) / 10; // 0..100
  const c = (h >> 20) % 100; // 0..100
  const latencyP95Ms = 80 + Math.round(a * 4); // ~80..480ms
  const errorRatePct = Math.round((b / 10) * 10) / 10; // 0..10.0
  const budgetUsedPct = c;
  const tokensPerMin = 200 + Math.round(((h >> 5) % 9000) / 10);
  const status: NodeMetrics['status'] =
    errorRatePct > 8 || latencyP95Ms > 400
      ? 'down'
      : errorRatePct > 3 || latencyP95Ms > 250
        ? 'degraded'
        : 'healthy';
  return { latencyP95Ms, errorRatePct, budgetUsedPct, tokensPerMin, status };
}

export const STATUS_COLOR: Record<NodeMetrics['status'], string> = {
  healthy: '#34d399',
  degraded: '#fbbf24',
  down: '#f87171',
};
