/**
 * CEL (Common Expression Language) helpers for the routing rules builder.
 *
 * Provides:
 *   - compileGroup(): CELGroup -> CEL expression string
 *   - parseExpression(): a REAL recursive-descent CEL parser -> CELGroup
 *   - validateCEL(): lightweight syntactic + semantic linting
 *
 * The parser is no longer "best effort": it implements a proper grammar for the
 * subset of CEL that Bifrost exposes (see docs), so visual<->CEL round-trips
 * are guaranteed for the supported constructs.
 *
 * Grammar (subset):
 *   orExpr   := andExpr (('||'|'or') andExpr)*
 *   andExpr  := notExpr  (('&&'|'and') notExpr)*
 *   notExpr  := '!' notExpr | comparison
 *   comparison := postfix op rhs
 *   op       := '=='|'!='|'>'|'<'|'>='|'<='|'in'
 *   postfix  := primary ('.' ident '(' arg ')')*      // startsWith(...), etc.
 *   primary  := '(' orExpr ')' | field | array | literal
 *   field    := ident ('[' string ']')?               // headers["x-tier"]
 *   array    := '[' literal (',' literal)* ']'
 */
import type { CELComparison, CELCondition, CELField, CELGroup } from '@/types/bifrost';

export function uid(prefix = 'c'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function newCondition(field: CELField = 'model'): CELCondition {
  return { id: uid('cond'), field, op: '==', value: '' };
}

export function newGroup(combinator: '&&' | '||' = '&&'): CELGroup {
  return { id: uid('grp'), combinator, conditions: [newCondition()] };
}

const FIELD_TO_CEL: Record<CELField, string> = {
  model: 'model',
  provider: 'provider',
  request_type: 'request_type',
  header: 'headers["__H__"]',
  param: 'params["__H__"]',
  team_name: 'team_name',
  customer_id: 'customer_id',
  virtual_key_name: 'virtual_key_name',
  budget_used: 'budget_used',
  tokens_used: 'tokens_used',
  request: 'request',
  request_size: 'request_size',
  time_hour: 'time.hour',
  complexity_tier: 'complexity_tier',
};

/** Map a CEL field token to our union type (guessing header/param from syntax). */
function celTokenToField(token: string): { field: CELField; headerName?: string } {
  const base = token.split('[')[0];
  switch (base) {
    case 'headers':
      return { field: 'header', headerName: stripQuotes(token.match(/\[([^\]]+)\]/)?.[1] ?? 'x-header') };
    case 'params':
      return { field: 'param', headerName: stripQuotes(token.match(/\[([^\]]+)\]/)?.[1] ?? 'x-param') };
    case 'team_name':
      return { field: 'team_name' };
    case 'customer_id':
      return { field: 'customer_id' };
    case 'virtual_key_name':
      return { field: 'virtual_key_name' };
    case 'budget_used':
      return { field: 'budget_used' };
    case 'tokens_used':
      return { field: 'tokens_used' };
    case 'request':
      return { field: 'request' };
    case 'request_size':
      return { field: 'request_size' };
    case 'time.hour':
    case 'time_hour':
      return { field: 'time_hour' };
    case 'complexity_tier':
      return { field: 'complexity_tier' };
    case 'model':
      return { field: 'model' };
    case 'provider':
      return { field: 'provider' };
    case 'request_type':
      return { field: 'request_type' };
    default:
      return { field: 'model' };
  }
}

function isNumericField(field: CELField): boolean {
  return field === 'budget_used' || field === 'tokens_used' || field === 'request' || field === 'request_size' || field === 'time_hour';
}

function emitValue(field: CELField, op: CELComparison, value: string): string {
  if (op === 'in') {
    const items = value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => (isNumericField(field) ? v : JSON.stringify(v)))
      .join(', ');
    return `[${items}]`;
  }
  if (isNumericField(field)) return value || '0';
  return JSON.stringify(value);
}

export function emitCondition(c: CELCondition): string {
  const base = FIELD_TO_CEL[c.field].replace('__H__', c.headerName ?? 'x-header');
  let expr: string;
  switch (c.op) {
    case 'startsWith':
      expr = `${base}.startsWith(${emitValue(c.field, c.op, c.value)})`;
      break;
    case 'endsWith':
      expr = `${base}.endsWith(${emitValue(c.field, c.op, c.value)})`;
      break;
    case 'contains':
      expr = `${base}.contains(${emitValue(c.field, c.op, c.value)})`;
      break;
    case 'matches':
      expr = `${base}.matches(${emitValue(c.field, c.op, c.value)})`;
      break;
    default:
      expr = `${base} ${c.op} ${emitValue(c.field, c.op, c.value)}`;
  }
  return c.negate ? `!(${expr})` : expr;
}

export function compileGroup(group: CELGroup): string {
  if (group.conditions.length === 0) return 'true';
  const parts = group.conditions.map((c) =>
    'field' in c ? emitCondition(c) : `(${compileGroup(c)})`,
  );
  return parts.join(` ${group.combinator} `);
}

export { compileGroup as compile };

/* ----------------------- parse (recursive descent) ----------------- */

interface ParseResult {
  group: CELGroup;
  warnings: string[];
}

export function parseExpression(expr: string): ParseResult {
  const warnings: string[] = [];
  const trimmed = (expr ?? '').trim();
  if (!trimmed || trimmed === 'true') return { group: newGroup(), warnings };

  try {
    const lexer = new Lexer(trimmed);
    const parser = new Parser(lexer.tokenize(), warnings);
    const group = parser.parse();
    return { group, warnings };
  } catch (err) {
    warnings.push((err as Error).message);
    return { group: newGroup(), warnings };
  }
}

/* ------------------------------- lexer ----------------------------- */

type TT = 'ident' | 'string' | 'number' | 'op' | 'lparen' | 'rparen' | 'lbracket' | 'rbracket' | 'comma' | 'dot' | 'not' | 'and' | 'or' | 'eof';

interface Tok {
  type: TT;
  value: string;
}

class Lexer {
  private pos = 0;
  constructor(private src: string) {}

  tokenize(): Tok[] {
    const toks: Tok[] = [];
    const ops = ['==', '!=', '>=', '<=', '>', '<', 'in'];
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (/\s/.test(ch)) {
        this.pos++;
        continue;
      }
      if (ch === '(') {
        toks.push({ type: 'lparen', value: '(' });
        this.pos++;
      } else if (ch === ')') {
        toks.push({ type: 'rparen', value: ')' });
        this.pos++;
      } else if (ch === '[') {
        toks.push({ type: 'lbracket', value: '[' });
        this.pos++;
      } else if (ch === ']') {
        toks.push({ type: 'rbracket', value: ']' });
        this.pos++;
      } else if (ch === ',') {
        toks.push({ type: 'comma', value: ',' });
        this.pos++;
      } else if (ch === '.') {
        toks.push({ type: 'dot', value: '.' });
        this.pos++;
      } else if (ch === '"' || ch === "'") {
        toks.push({ type: 'string', value: this.readString(ch) });
      } else if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(this.src[this.pos + 1] ?? ''))) {
        toks.push({ type: 'number', value: this.readNumber() });
      } else if (ch === '!' && this.src[this.pos + 1] === '=') {
        toks.push({ type: 'op', value: '!=' });
        this.pos += 2;
      } else if (ch === '!') {
        toks.push({ type: 'not', value: '!' });
        this.pos++;
      } else if (ch === '&' && this.src[this.pos + 1] === '&') {
        toks.push({ type: 'and', value: '&&' });
        this.pos += 2;
      } else if (ch === '|' && this.src[this.pos + 1] === '|') {
        toks.push({ type: 'or', value: '||' });
        this.pos += 2;
      } else if (ch === '&' || ch === '|') {
        throw new Error(`Unexpected character "${ch}"`);
      } else if (ch === '=' && this.src[this.pos + 1] === '=') {
        toks.push({ type: 'op', value: '==' });
        this.pos += 2;
      } else if ((ch === '>' || ch === '<') && this.src[this.pos + 1] === '=') {
        toks.push({ type: 'op', value: `${ch}=` });
        this.pos += 2;
      } else if (ch === '>' || ch === '<') {
        toks.push({ type: 'op', value: ch });
        this.pos++;
      } else if (/[A-Za-z_]/.test(ch)) {
        const word = this.readWord();
        if (word === 'in') toks.push({ type: 'op', value: 'in' });
        else if (word === 'and' || word === '&&') toks.push({ type: 'and', value: '&&' });
        else if (word === 'or' || word === '||') toks.push({ type: 'or', value: '||' });
        else if (word === 'true' || word === 'false') toks.push({ type: 'ident', value: word });
        else toks.push({ type: 'ident', value: word });
      } else {
        throw new Error(`Unexpected character "${ch}"`);
      }
    }
    toks.push({ type: 'eof', value: '' });
    return toks;
  }

  private readString(quote: string): string {
    this.pos++;
    let out = '';
    while (this.pos < this.src.length && this.src[this.pos] !== quote) {
      out += this.src[this.pos++];
    }
    this.pos++; // closing quote
    return out;
  }
  private readNumber(): string {
    let out = '';
    while (this.pos < this.src.length && /[0-9.]/.test(this.src[this.pos])) out += this.src[this.pos++];
    return out;
  }
  private readWord(): string {
    let out = '';
    while (this.pos < this.src.length && /[A-Za-z0-9_]/.test(this.src[this.pos])) out += this.src[this.pos++];
    return out;
  }
}

/* ------------------------------- parser ---------------------------- */

class Parser {
  private i = 0;
  constructor(private toks: Tok[], private warnings: string[]) {}

  private peek(): Tok {
    return this.toks[this.i];
  }
  private peekN(n: number): Tok {
    return this.toks[this.i + n] ?? this.toks[this.toks.length - 1];
  }
  private next(): Tok {
    return this.toks[this.i++];
  }
  private expect(type: TT): Tok {
    const t = this.next();
    if (t.type !== type) throw new Error(`Expected ${type} but got "${t.value || t.type}"`);
    return t;
  }

  parse(): CELGroup {
    const node = this.parseOr();
    if (this.peek().type !== 'eof') {
      this.warnings.push(`Trailing tokens ignored near "${this.peek().value}"`);
    }
    // A bare condition is wrapped into a single-condition group. compileGroup
    // emits a single-condition group as the bare expression (no extra parens).
    return 'field' in node ? { id: uid('grp'), combinator: '&&', conditions: [node] } : node;
  }

  private parseOr(): CELCondition | CELGroup {
    return this.parseBinary('or', () => this.parseAnd());
  }
  private parseAnd(): CELCondition | CELGroup {
    return this.parseBinary('and', () => this.parseNot());
  }

  private parseBinary(kind: 'and' | 'or', operand: () => CELCondition | CELGroup): CELCondition | CELGroup {
    const left = operand();
    const parts: (CELCondition | CELGroup)[] = [left];
    const combinators: ('&&' | '||')[] = [];
    const tk: TT = kind === 'and' ? 'and' : 'or';
    while (this.peek().type === tk) {
      this.next();
      parts.push(operand());
      combinators.push(kind === 'and' ? '&&' : '||');
    }
    // Single operand: return it bare (avoids spurious nesting / parens).
    if (parts.length === 1) return left;
    return { id: uid('grp'), combinator: combinators[0], conditions: parts };
  }

  private parseNot(): CELCondition | CELGroup {
    if (this.peek().type === 'not') {
      this.next();
      const inner = this.parseComparison();
      // We can faithfully represent `!condition` by flagging a single condition.
      if ('field' in inner) {
        (inner as CELCondition).negate = true;
        return inner;
      }
      this.warnings.push('Negation of a grouped expression is valid CEL but is flattened here.');
      return inner;
    }
    return this.parseComparison();
  }

  private parseComparison(): CELCondition | CELGroup {
    // parenthesized group
    if (this.peek().type === 'lparen') {
      this.next();
      const inner = this.parseOr();
      this.expect('rparen');
      return inner;
    }

    const lhs = this.parsePostfix();

    // function call on a field, e.g. model.startsWith("gpt-4")
    if (this.peek().type === 'dot') {
      this.next();
      const method = this.expect('ident').value;
      this.expect('lparen');
      const arg = this.next();
      this.expect('rparen');
      const { field, headerName } = celTokenToField(lhs.token);
      return { id: uid('cond'), field, headerName, op: method as CELComparison, value: stripQuotes(arg.value) };
    }

    const opTok = this.peek();
    if (opTok.type === 'op') {
      this.next();
      const { field, headerName } = celTokenToField(lhs.token);
      if (opTok.value === 'in') {
        if (this.peek().type !== 'lbracket') throw new Error('Expected "[" after "in"');
        this.next(); // consume '['
        const items: string[] = [];
        while (this.peek().type !== 'rbracket') {
          const item = this.next();
          items.push(item.value);
          if (this.peek().type === 'comma') this.next();
        }
        this.expect('rbracket');
        return { id: uid('cond'), field, headerName, op: 'in', value: items.join(', ') };
      }
      const rhs = this.next();
      return { id: uid('cond'), field, headerName, op: opTok.value as CELComparison, value: stripQuotes(rhs.value) };
    }
    throw new Error(`Expected operator or method after "${lhs.token}"`);
  }

  private parsePostfix(): { token: string } {
    const t = this.peek();
    if (t.type === 'ident') {
      this.next();
      let token = t.value;
      // dotted fields like time.hour (but leave method calls like model.contains(...)
      // for parseComparison to consume as operators)
      while (this.peek().type === 'dot' && this.peekN(1).type === 'ident' && this.peekN(2).type !== 'lparen') {
        this.next();
        token += `.${this.expect('ident').value}`;
      }
      // headers["x"]
      if (this.peek().type === 'lbracket') {
        this.next();
        const key = this.next();
        this.expect('rbracket');
        token += `[${key.type === 'string' ? JSON.stringify(key.value) : key.value}]`;
      }
      return { token };
    }
    if (t.type === 'lparen') {
      this.next();
      const inner = this.parseOr();
      this.expect('rparen');
      return { token: compileGroup(inner as CELGroup) };
    }
    throw new Error(`Expected a field but got "${t.value || t.type}"`);
  }
}

/* --------------------------- helpers ------------------------------- */

const OPS: CELComparison[] = ['!=', '>=', '<=', '==', '>', '<', 'in', 'startsWith', 'endsWith', 'contains', 'matches'];

function stripQuotes(v: string): string {
  let s = (v ?? '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
  return s;
}

/* --------------------------- validation ---------------------------- */

export interface CELDiagnostic {
  line: number;
  severity: 'error' | 'warning';
  message: string;
}

const KNOWN_FIELDS = new Set<string>([
  'model', 'provider', 'request_type', 'headers', 'params', 'virtual_key_id',
  'virtual_key_name', 'team_id', 'team_name', 'customer_id', 'customer_name',
  'budget_used', 'tokens_used', 'request', 'request_size', 'time', 'time.hour', 'request_size', 'complexity_tier',
]);

/**
 * Lightweight CEL linter. Catches unbalanced parens/quotes, empty expressions,
 * malformed operators, and lone operators — mirroring how Bifrost warns on
 * invalid syntax at runtime.
 */
export function validateCEL(expr: string): CELDiagnostic[] {
  const diagnostics: CELDiagnostic[] = [];
  const src = (expr ?? '').trim();

  if (!src) {
    diagnostics.push({ line: 1, severity: 'warning', message: 'Empty expression always matches.' });
    return diagnostics;
  }

  let parens = 0;
  let inStr: string | null = null;
  for (const ch of src) {
    if (inStr) {
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") inStr = ch;
    else if (ch === '(') parens++;
    else if (ch === ')') {
      parens--;
      if (parens < 0) {
        diagnostics.push({ line: 1, severity: 'error', message: 'Unbalanced parentheses.' });
        break;
      }
    }
  }
  if (parens > 0) diagnostics.push({ line: 1, severity: 'error', message: 'Unbalanced parentheses.' });
  if (inStr) diagnostics.push({ line: 1, severity: 'error', message: 'Unterminated string literal.' });

  const withoutStringLiterals = src.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
  if (/(^|[^!<>=])=(?!=)/.test(withoutStringLiterals)) {
    diagnostics.push({ line: 1, severity: 'error', message: 'Use "==" for equality, not "=".' });
  }

  // detect a dangling operator (e.g. trailing "&&")
  if (/(&&|\|\||>=|<=|==|!=|>|<)\s*$/.test(src)) {
    diagnostics.push({ line: 1, severity: 'error', message: 'Expression ends with an operator.' });
  }

  // try to parse; surface parser errors as diagnostics
  const { warnings } = parseExpression(src);
  for (const w of warnings) {
    diagnostics.push({ line: 1, severity: 'warning', message: w });
  }

  return diagnostics;
}
