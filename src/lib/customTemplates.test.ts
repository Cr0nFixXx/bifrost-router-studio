import { describe, it, expect } from 'vitest';
import { parseCustomPack } from './customTemplates';

describe('parseCustomPack', () => {
  it('normalizes an array of templates', () => {
    const out = parseCustomPack('[{"name":"x","nodes":[],"edges":[]}]');
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('x');
    expect(out[0].nodes).toEqual([]);
    expect(typeof out[0].id).toBe('string');
  });

  it('accepts a { templates: [...] } envelope', () => {
    const out = parseCustomPack('{"templates":[{"name":"y"}]}');
    expect(out[0].name).toBe('y');
  });

  it('throws on invalid input', () => {
    expect(() => parseCustomPack('{"foo":1}')).toThrow();
  });
});
