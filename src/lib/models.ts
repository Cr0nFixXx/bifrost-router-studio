/**
 * Built-in vendor model catalog. Used as a fallback when the DB has no
 * `models` rows and no upstream is configured (this app has no backend).
 */
export interface CatalogModel {
  id: string;
  provider?: string;
  label?: string;
  model?: string;
}

const LIST: ReadonlyArray<[provider: string, model: string]> = [
  ['openai', 'gpt-4o'],
  ['openai', 'gpt-4o-mini'],
  ['openai', 'o3-mini'],
  ['anthropic', 'claude-3-7-sonnet-latest'],
  ['anthropic', 'claude-3-5-haiku-latest'],
  ['groq', 'llama-3.1-70b-versatile'],
  ['groq', 'llama-3.1-8b-instant'],
  ['gemini', 'gemini-2.0-pro-exp-02-05'],
  ['gemini', 'gemini-2.0-flash'],
  ['mistral', 'mistral-large-latest'],
  ['cohere', 'command-r-plus'],
  ['azure', 'gpt-4o'],
];

export function builtInCatalog(): CatalogModel[] {
  return LIST.map(([provider, model]) => ({ id: `${provider}/${model}`, provider, model, label: model }));
}
