import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '@/store/useStore';
import { rulesToWorkflow } from '@/lib/bifrostMapper';
import type { RoutingRule } from '@/types/bifrost';

/**
 * The simulation used to hand its expression to `new Function` after rewriting two
 * method names. JS `in` tests array *indices*, and `time.hour` / `request_size` were
 * never in the context, so those conditions were silently always false — no error,
 * no log. The evaluator lives in `cel.ts`; these cases pin that the store actually
 * routes through it, because a mock that "looks right" in a unit test is worthless
 * if the caller keeps its own path.
 */

const rule = (id: string, cel: string, priority: number): RoutingRule => ({
  id, name: id, enabled: true, chain_rule: false,
  cel_expression: cel,
  targets: [{ provider: 'openai', model: 'gpt-4o-mini', weight: 1 }],
  fallbacks: [], scope: 'global', scope_id: null, priority,
});

const canvasOf = (rules: RoutingRule[]) => {
  const { nodes, edges } = rulesToWorkflow(rules, { dedupeConditions: true });
  useStore.setState({ nodes, edges, providers: [] });
};

const run = async () => {
  await useStore.getState().runSimulation();
  return useStore.getState().sim;
};

describe('simulation routing', () => {
  beforeEach(() => {
    useStore.getState().resetSimInput();
    useStore.getState().clearSimulation();
  });

  it('matches `in` as membership', async () => {
    canvasOf([rule('r1', 'complexity_tier in ["COMPLEX","REASONING"]', 0)]);
    expect((await run())?.matched).toBe(true);
  });

  it('does not match a tier outside the list', async () => {
    canvasOf([rule('r1', 'complexity_tier in ["SIMPLE","MEDIUM"]', 0)]);
    expect((await run())?.matched).toBe(false);
  });

  it('evaluates time.hour from the clock', async () => {
    canvasOf([rule('r1', 'time.hour >= 0 && time.hour <= 23', 0)]);
    expect((await run())?.matched).toBe(true);
  });

  it('evaluates request_size from the playground input', async () => {
    canvasOf([rule('r1', 'request_size > 1000', 0)]);
    useStore.getState().setSimInput({ request_size: 1200 });
    expect((await run())?.matched).toBe(true);
  });

  it('evaluates params from the playground input', async () => {
    canvasOf([rule('r1', 'params["stream"] == "true"', 0)]);
    useStore.getState().setSimInput({ params: { stream: 'true' } });
    expect((await run())?.matched).toBe(true);
  });

  it('matches a header regardless of case', async () => {
    canvasOf([rule('r1', 'headers["X-TIER"] == "premium"', 0)]);
    useStore.getState().setSimInput({ headers: { 'x-tier': 'premium' } });
    expect((await run())?.matched).toBe(true);
  });

  it('reports an undecidable condition as a note instead of a silent false', async () => {
    canvasOf([rule('r1', 'model.matches("[")', 0)]);
    const sim = await run();
    expect(sim?.matched).toBe(false);
    expect(sim?.path[0]?.note).toContain('not evaluable');
  });
});