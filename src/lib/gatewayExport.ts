/**
 * Gateway export adapters.
 *
 * Best-effort translators from Bifrost routing rules to the config shapes used
 * by other LLM gateways. These are approximations: no other gateway expresses
 * Bifrost's full CEL condition language, so conditions are preserved as comments
 * (LiteLLM YAML) or a `condition` field (model-groups JSON) for reference.
 */
import type { ProviderConfig, RoutingRule, RoutingTarget } from '@/types/bifrost';

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'group'
  );
}

function targetModel(t: RoutingTarget): string {
  return t.model || t.provider || 'unknown';
}

function modelRef(t: RoutingTarget, providerType: Map<string, string>): string {
  const model = targetModel(t);
  if (!t.provider) return model;
  const type = providerType.get(t.provider) || 'openai';
  return type + '/' + model;
}

export function toLiteLLM(rules: RoutingRule[], providers: ProviderConfig[] = []): string {
  const providerType = new Map(providers.map((p) => [p.id, p.type]));
  const out: string[] = [];
  out.push('# LiteLLM router config (best-effort translation of Bifrost routing rules)');
  out.push('# CEL conditions have no LiteLLM equivalent and are kept as comments.');
  out.push('# Weighted targets become multiple deployments of the same model_name (LiteLLM');
  out.push('# load-balances them); the weight itself is recorded as a comment.');
  out.push('model_list:');

  const fallbacks: Array<{ group: string; targets: string[] }> = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const group = slug(rule.name) + '-' + rule.id;
    out.push('  # rule: ' + rule.name + '  (priority ' + rule.priority + ')');
    if (rule.cel_expression && rule.cel_expression.trim() && rule.cel_expression.trim() !== 'true') {
      out.push('  # CEL: ' + rule.cel_expression);
    }
    if (rule.chain_rule) out.push('  # chain_rule: true');
    if (rule.targets.length === 0) {
      out.push('  # (no targets)');
      continue;
    }
    for (const t of rule.targets) {
      out.push('  - model_name: ' + group);
      out.push('    litellm_params:');
      out.push('      model: ' + modelRef(t, providerType));
      out.push('      # weight: ' + t.weight);
    }
    if (rule.fallbacks.length) {
      fallbacks.push({
        group,
        targets: rule.fallbacks.map((f) => (f.includes('/') ? f.split('/').pop()! : f)),
      });
    }
  }

  out.push('');
  out.push('router_settings:');
  out.push('  routing_strategy: "simple-shuffle"');
  out.push('  num_retries: 2');
  if (fallbacks.length) {
    out.push('  fallbacks:');
    for (const fb of fallbacks) {
      out.push('    - "' + fb.group + '":');
      for (const m of fb.targets) out.push('        - "' + m + '"');
    }
  }

  return out.join('\n') + '\n';
}

export interface ModelGroup {
  name: string;
  members: string[];
  weights: Record<string, number>;
  fallbacks: string[];
  condition?: string;
}

export interface ModelGroupsConfig {
  model_groups: ModelGroup[];
}

export function toOpenAIModelGroups(rules: RoutingRule[], providers: ProviderConfig[] = []): ModelGroupsConfig {
  const providerType = new Map(providers.map((p) => [p.id, p.type]));
  return {
    model_groups: rules
      .filter((r) => r.enabled)
      .map((r) => {
        const weights: Record<string, number> = {};
        const members: string[] = [];
        for (const t of r.targets) {
          const ref = modelRef(t, providerType);
          if (!members.includes(ref)) members.push(ref);
          weights[ref] = (weights[ref] || 0) + t.weight;
        }
        const group: ModelGroup = {
          name: slug(r.name) + '-' + r.id,
          members,
          weights,
          fallbacks: r.fallbacks,
        };
        if (r.cel_expression && r.cel_expression.trim() && r.cel_expression.trim() !== 'true') {
          group.condition = r.cel_expression;
        }
        return group;
      }),
  };
}
