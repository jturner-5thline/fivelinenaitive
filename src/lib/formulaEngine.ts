/**
 * Spreadsheet Formula Engine
 * Evaluates formulas starting with '=' supporting common Excel functions.
 */

type CellValue = string | number | null;
type SheetData = CellValue[][];
type SheetLookup = Record<string, SheetData>; // sheetName -> data

// Parse a cell reference like "A1", "B2", "$A$1"
function parseRef(ref: string): { row: number; col: number } | null {
  const match = ref.replace(/\$/g, '').match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  const colStr = match[1].toUpperCase();
  const row = parseInt(match[2], 10) - 1;
  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }
  col -= 1;
  return { row, col };
}

// Parse a range like "A1:B5"
function parseRange(range: string): { start: { row: number; col: number }; end: { row: number; col: number } } | null {
  const [startStr, endStr] = range.split(':');
  if (!startStr || !endStr) return null;
  const start = parseRef(startStr.trim());
  const end = parseRef(endStr.trim());
  if (!start || !end) return null;
  return { start, end };
}

// Get values from a range
function getRangeValues(data: SheetData, rangeStr: string): CellValue[] {
  const range = parseRange(rangeStr);
  if (!range) return [];
  const values: CellValue[] = [];
  const minR = Math.min(range.start.row, range.end.row);
  const maxR = Math.max(range.start.row, range.end.row);
  const minC = Math.min(range.start.col, range.end.col);
  const maxC = Math.max(range.start.col, range.end.col);
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      values.push(data[r]?.[c] ?? null);
    }
  }
  return values;
}

function toNumber(v: CellValue): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function toNumbers(values: CellValue[]): number[] {
  return values.filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v))).map(toNumber);
}

// Tokenizer for formula expressions
type Token = 
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'ref'; value: string }
  | { type: 'range'; value: string }
  | { type: 'func'; value: string }
  | { type: 'op'; value: string }
  | { type: 'paren'; value: string }
  | { type: 'comma' }
  | { type: 'colon' };

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = formula.trim();
  
  while (i < s.length) {
    // Skip whitespace
    if (s[i] === ' ' || s[i] === '\t') { i++; continue; }
    
    // String literal
    if (s[i] === '"') {
      let str = '';
      i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '\\' && i + 1 < s.length) { str += s[i + 1]; i += 2; }
        else { str += s[i]; i++; }
      }
      i++; // closing quote
      tokens.push({ type: 'string', value: str });
      continue;
    }
    
    // Number
    if (/[0-9.]/.test(s[i]) && (tokens.length === 0 || tokens[tokens.length - 1].type === 'op' || tokens[tokens.length - 1].type === 'paren' || tokens[tokens.length - 1].type === 'comma')) {
      let num = '';
      while (i < s.length && /[0-9.eE]/.test(s[i])) { num += s[i]; i++; }
      tokens.push({ type: 'number', value: parseFloat(num) });
      continue;
    }
    if (/[0-9]/.test(s[i])) {
      let num = '';
      while (i < s.length && /[0-9.eE]/.test(s[i])) { num += s[i]; i++; }
      tokens.push({ type: 'number', value: parseFloat(num) });
      continue;
    }
    
    // Operators
    if (s[i] === '+' || s[i] === '-' || s[i] === '*' || s[i] === '/' || s[i] === '^') {
      // Handle negative numbers
      if (s[i] === '-' && (tokens.length === 0 || tokens[tokens.length - 1].type === 'op' || tokens[tokens.length - 1].type === 'paren' || tokens[tokens.length - 1].type === 'comma')) {
        let num = '-';
        i++;
        while (i < s.length && /[0-9.eE]/.test(s[i])) { num += s[i]; i++; }
        if (num.length > 1) {
          tokens.push({ type: 'number', value: parseFloat(num) });
          continue;
        }
        // It's a unary minus before a ref/func, treat as op
        tokens.push({ type: 'op', value: '-' });
        continue;
      }
      tokens.push({ type: 'op', value: s[i] }); i++; continue;
    }
    
    // Comparison operators
    if (s[i] === '>' || s[i] === '<' || s[i] === '=') {
      let op = s[i]; i++;
      if (i < s.length && (s[i] === '=' || (op === '<' && s[i] === '>'))) { op += s[i]; i++; }
      tokens.push({ type: 'op', value: op }); continue;
    }
    if (s[i] === '!' && i + 1 < s.length && s[i + 1] === '=') {
      tokens.push({ type: 'op', value: '!=' }); i += 2; continue;
    }
    
    // Concatenation
    if (s[i] === '&') { tokens.push({ type: 'op', value: '&' }); i++; continue; }
    
    // Parens
    if (s[i] === '(' || s[i] === ')') { tokens.push({ type: 'paren', value: s[i] }); i++; continue; }
    
    // Comma
    if (s[i] === ',') { tokens.push({ type: 'comma' }); i++; continue; }
    
    // Colon (for ranges)
    if (s[i] === ':') { tokens.push({ type: 'colon' }); i++; continue; }
    
    // Identifier (function name or cell reference)
    if (/[A-Za-z$_]/.test(s[i])) {
      let id = '';
      while (i < s.length && /[A-Za-z0-9$_.]/.test(s[i])) { id += s[i]; i++; }
      
      // Check for TRUE/FALSE
      if (id.toUpperCase() === 'TRUE') { tokens.push({ type: 'bool', value: true }); continue; }
      if (id.toUpperCase() === 'FALSE') { tokens.push({ type: 'bool', value: false }); continue; }
      
      // Check if next non-space is '(' => function
      let j = i;
      while (j < s.length && s[j] === ' ') j++;
      if (j < s.length && s[j] === '(') {
        tokens.push({ type: 'func', value: id.toUpperCase() });
        continue;
      }
      
      // Check if next token would be ':' => it's part of a range, keep as ref
      tokens.push({ type: 'ref', value: id.toUpperCase() });
      continue;
    }
    
    // Skip unknown
    i++;
  }
  
  // Post-process: merge ref:ref into range tokens
  const merged: Token[] = [];
  for (let k = 0; k < tokens.length; k++) {
    if (tokens[k].type === 'ref' && k + 2 < tokens.length && tokens[k + 1].type === 'colon' && tokens[k + 2].type === 'ref') {
      merged.push({ type: 'range', value: `${(tokens[k] as any).value}:${(tokens[k + 2] as any).value}` });
      k += 2;
    } else {
      merged.push(tokens[k]);
    }
  }
  
  return merged;
}

// Simple recursive descent parser/evaluator
interface EvalContext {
  data: SheetData;
  sheets: SheetLookup;
  currentSheet: string;
  evaluating: Set<string>; // cycle detection
  evaluate: (row: number, col: number, data: SheetData) => CellValue;
}

function evaluateTokens(tokens: Token[], ctx: EvalContext): CellValue {
  let pos = 0;
  
  function peek(): Token | undefined { return tokens[pos]; }
  function consume(): Token { return tokens[pos++]; }
  
  function parseExpression(): CellValue {
    return parseComparison();
  }
  
  function parseComparison(): CellValue {
    let left = parseConcatenation();
    while (peek() && peek()!.type === 'op' && ['=', '==', '!=', '<>', '<', '>', '<=', '>='].includes((peek() as any).value)) {
      const op = (consume() as any).value;
      const right = parseConcatenation();
      const l = toNumber(left), r = toNumber(right);
      let cmpResult = false;
      switch (op) {
        case '=': case '==': cmpResult = left == right; break;
        case '!=': case '<>': cmpResult = left != right; break;
        case '<': cmpResult = l < r; break;
        case '>': cmpResult = l > r; break;
        case '<=': cmpResult = l <= r; break;
        case '>=': cmpResult = l >= r; break;
      }
      left = cmpResult ? 1 : 0;
    }
    return left;
  }
  
  function parseConcatenation(): CellValue {
    let left = parseAddSub();
    while (peek() && peek()!.type === 'op' && (peek() as any).value === '&') {
      consume();
      const right = parseAddSub();
      left = String(left ?? '') + String(right ?? '');
    }
    return left;
  }
  
  function parseAddSub(): CellValue {
    let left = parseMulDiv();
    while (peek() && peek()!.type === 'op' && ['+', '-'].includes((peek() as any).value)) {
      const op = (consume() as any).value;
      const right = parseMulDiv();
      if (op === '+') left = toNumber(left) + toNumber(right);
      else left = toNumber(left) - toNumber(right);
    }
    return left;
  }
  
  function parseMulDiv(): CellValue {
    let left = parsePower();
    while (peek() && peek()!.type === 'op' && ['*', '/'].includes((peek() as any).value)) {
      const op = (consume() as any).value;
      const right = parsePower();
      if (op === '*') left = toNumber(left) * toNumber(right);
      else {
        const d = toNumber(right);
        left = d === 0 ? '#DIV/0!' : toNumber(left) / d;
      }
    }
    return left;
  }
  
  function parsePower(): CellValue {
    let base = parsePrimary();
    while (peek() && peek()!.type === 'op' && (peek() as any).value === '^') {
      consume();
      const exp = parsePrimary();
      base = Math.pow(toNumber(base), toNumber(exp));
    }
    return base;
  }
  
  function resolveRef(refStr: string): CellValue {
    const ref = parseRef(refStr);
    if (!ref) return '#REF!';
    const key = `${ref.row},${ref.col}`;
    if (ctx.evaluating.has(key)) return '#CIRC!';
    return ctx.evaluate(ref.row, ref.col, ctx.data);
  }
  
  function collectArgs(): CellValue[][] {
    // Collect function arguments, where each arg can be a single value or range
    const args: CellValue[][] = [];
    let current: CellValue[] = [];
    
    // We need a different approach - parse args as expressions separated by commas
    return args; // placeholder
  }
  
  function parseFuncArgs(): CellValue[] {
    // Parse comma-separated arguments
    const args: CellValue[] = [];
    if (peek()?.type === 'paren' && (peek() as any).value === ')') return args;
    args.push(parseExpression());
    while (peek()?.type === 'comma') {
      consume();
      args.push(parseExpression());
    }
    return args;
  }
  
  function parseFuncRangeArgs(): (CellValue | CellValue[])[] {
    // Parse args that can be ranges or single values
    const args: (CellValue | CellValue[])[] = [];
    if (peek()?.type === 'paren' && (peek() as any).value === ')') return args;
    
    // Check if next token is a range
    if (peek()?.type === 'range') {
      const rangeToken = consume();
      args.push(getRangeValues(ctx.data, (rangeToken as any).value));
    } else {
      args.push(parseExpression());
    }
    
    while (peek()?.type === 'comma') {
      consume();
      if (peek()?.type === 'range') {
        const rangeToken = consume();
        args.push(getRangeValues(ctx.data, (rangeToken as any).value));
      } else {
        args.push(parseExpression());
      }
    }
    return args;
  }
  
  function flattenArgs(args: (CellValue | CellValue[])[]): CellValue[] {
    const result: CellValue[] = [];
    for (const a of args) {
      if (Array.isArray(a)) result.push(...a);
      else result.push(a);
    }
    return result;
  }
  
  function evalFunction(name: string): CellValue {
    // consume '('
    consume();
    
    const rangeArgs = parseFuncRangeArgs();
    const allValues = flattenArgs(rangeArgs);
    
    // consume ')'
    if (peek()?.type === 'paren' && (peek() as any).value === ')') consume();
    
    switch (name) {
      case 'SUM': return toNumbers(allValues).reduce((a, b) => a + b, 0);
      case 'AVERAGE': case 'AVG': {
        const nums = toNumbers(allValues);
        return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
      }
      case 'COUNT': return allValues.filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v))).length;
      case 'COUNTA': return allValues.filter(v => v !== null && v !== undefined && v !== '').length;
      case 'COUNTBLANK': return allValues.filter(v => v === null || v === undefined || v === '').length;
      case 'MAX': { const nums = toNumbers(allValues); return nums.length ? Math.max(...nums) : 0; }
      case 'MIN': { const nums = toNumbers(allValues); return nums.length ? Math.min(...nums) : 0; }
      case 'ABS': return Math.abs(toNumber(allValues[0]));
      case 'ROUND': return Math.round(toNumber(allValues[0]) * Math.pow(10, toNumber(allValues[1] ?? 0))) / Math.pow(10, toNumber(allValues[1] ?? 0));
      case 'ROUNDUP': { const f = Math.pow(10, toNumber(allValues[1] ?? 0)); return Math.ceil(toNumber(allValues[0]) * f) / f; }
      case 'ROUNDDOWN': { const f = Math.pow(10, toNumber(allValues[1] ?? 0)); return Math.floor(toNumber(allValues[0]) * f) / f; }
      case 'SQRT': return Math.sqrt(toNumber(allValues[0]));
      case 'POWER': case 'POW': return Math.pow(toNumber(allValues[0]), toNumber(allValues[1] ?? 1));
      case 'LN': return Math.log(toNumber(allValues[0]));
      case 'LOG': return Math.log10(toNumber(allValues[0]));
      case 'LOG10': return Math.log10(toNumber(allValues[0]));
      case 'EXP': return Math.exp(toNumber(allValues[0]));
      case 'PI': return Math.PI;
      case 'RAND': return Math.random();
      case 'INT': return Math.floor(toNumber(allValues[0]));
      case 'MOD': return toNumber(allValues[0]) % toNumber(allValues[1] ?? 1);
      
      // Text functions
      case 'LEN': return String(allValues[0] ?? '').length;
      case 'UPPER': return String(allValues[0] ?? '').toUpperCase();
      case 'LOWER': return String(allValues[0] ?? '').toLowerCase();
      case 'TRIM': return String(allValues[0] ?? '').trim();
      case 'LEFT': return String(allValues[0] ?? '').slice(0, toNumber(allValues[1] ?? 1));
      case 'RIGHT': return String(allValues[0] ?? '').slice(-toNumber(allValues[1] ?? 1));
      case 'MID': return String(allValues[0] ?? '').slice(toNumber(allValues[1] ?? 1) - 1, toNumber(allValues[1] ?? 1) - 1 + toNumber(allValues[2] ?? 1));
      case 'CONCATENATE': case 'CONCAT': return allValues.map(v => String(v ?? '')).join('');
      case 'SUBSTITUTE': {
        const str = String(allValues[0] ?? '');
        const old = String(allValues[1] ?? '');
        const rep = String(allValues[2] ?? '');
        return str.split(old).join(rep);
      }
      case 'TEXT': return String(allValues[0] ?? '');
      case 'VALUE': return toNumber(allValues[0]);
      
      // Logical functions
      case 'IF': {
        // For IF, we need the raw args not flattened
        const cond = toNumber(rangeArgs[0] as CellValue);
        const trueVal = rangeArgs.length > 1 ? rangeArgs[1] as CellValue : 1;
        const falseVal = rangeArgs.length > 2 ? rangeArgs[2] as CellValue : 0;
        return cond ? trueVal : falseVal;
      }
      case 'AND': return toNumbers(allValues).every(v => v !== 0) ? 1 : 0;
      case 'OR': return toNumbers(allValues).some(v => v !== 0) ? 1 : 0;
      case 'NOT': return toNumber(allValues[0]) === 0 ? 1 : 0;
      case 'IFERROR': {
        const val = rangeArgs[0] as CellValue;
        const fallback = rangeArgs.length > 1 ? rangeArgs[1] as CellValue : '';
        return (typeof val === 'string' && val.startsWith('#')) ? fallback : val;
      }
      case 'ISBLANK': return (allValues[0] === null || allValues[0] === undefined || allValues[0] === '') ? 1 : 0;
      case 'ISNUMBER': return typeof allValues[0] === 'number' ? 1 : 0;
      
      // Statistical
      case 'MEDIAN': {
        const sorted = toNumbers(allValues).sort((a, b) => a - b);
        if (sorted.length === 0) return 0;
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      }
      case 'STDEV': case 'STDEV.S': {
        const nums = toNumbers(allValues);
        if (nums.length < 2) return 0;
        const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
        const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (nums.length - 1);
        return Math.sqrt(variance);
      }
      case 'VAR': case 'VAR.S': {
        const nums = toNumbers(allValues);
        if (nums.length < 2) return 0;
        const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
        return nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (nums.length - 1);
      }
      
      // Financial functions
      case 'PMT': {
        const rate = toNumber(allValues[0]);
        const nper = toNumber(allValues[1]);
        const pv = toNumber(allValues[2]);
        if (rate === 0) return -(pv / nper);
        return -(rate * pv * Math.pow(1 + rate, nper)) / (Math.pow(1 + rate, nper) - 1);
      }
      case 'FV': {
        const rate = toNumber(allValues[0]);
        const nper = toNumber(allValues[1]);
        const pmt = toNumber(allValues[2]);
        const pv = toNumber(allValues[3] ?? 0);
        if (rate === 0) return -(pv + pmt * nper);
        return -(pv * Math.pow(1 + rate, nper) + pmt * (Math.pow(1 + rate, nper) - 1) / rate);
      }
      case 'PV': {
        const rate = toNumber(allValues[0]);
        const nper = toNumber(allValues[1]);
        const pmt = toNumber(allValues[2]);
        if (rate === 0) return -(pmt * nper);
        return -(pmt * (1 - Math.pow(1 + rate, -nper)) / rate);
      }
      case 'NPV': {
        const rate = toNumber(allValues[0]);
        let npv = 0;
        for (let i = 1; i < allValues.length; i++) {
          npv += toNumber(allValues[i]) / Math.pow(1 + rate, i);
        }
        return npv;
      }
      
      // Lookup (simplified VLOOKUP)
      case 'VLOOKUP': {
        const lookup = allValues[0];
        // VLOOKUP needs range, col_index, [exact_match]
        // Simplified: search first col of range for value, return col_index column
        // This is complex with our token structure, return placeholder
        return '#N/A';
      }
      
      // Date
      case 'NOW': return new Date().toLocaleString();
      case 'TODAY': return new Date().toLocaleDateString();
      case 'YEAR': return new Date(String(allValues[0])).getFullYear();
      case 'MONTH': return new Date(String(allValues[0])).getMonth() + 1;
      case 'DAY': return new Date(String(allValues[0])).getDate();
      
      // Aggregate
      case 'SUMPRODUCT': {
        // Simplified: if we have two range args, multiply pairwise and sum
        if (rangeArgs.length >= 2 && Array.isArray(rangeArgs[0]) && Array.isArray(rangeArgs[1])) {
          const a = rangeArgs[0] as CellValue[];
          const b = rangeArgs[1] as CellValue[];
          let sum = 0;
          for (let i = 0; i < Math.min(a.length, b.length); i++) {
            sum += toNumber(a[i]) * toNumber(b[i]);
          }
          return sum;
        }
        return 0;
      }
      
      default: return `#NAME?`;
    }
  }
  
  function parsePrimary(): CellValue {
    const token = peek();
    if (!token) return null;
    
    if (token.type === 'number') { consume(); return token.value; }
    if (token.type === 'string') { consume(); return token.value; }
    if (token.type === 'bool') { consume(); return token.value ? 1 : 0; }
    
    if (token.type === 'func') {
      const name = token.value;
      consume(); // func name
      return evalFunction(name);
    }
    
    if (token.type === 'range') {
      consume();
      // Standalone range returns array sum? Or first value?
      const values = getRangeValues(ctx.data, token.value);
      return toNumbers(values).reduce((a, b) => a + b, 0);
    }
    
    if (token.type === 'ref') {
      consume();
      return resolveRef(token.value);
    }
    
    if (token.type === 'paren' && token.value === '(') {
      consume();
      const val = parseExpression();
      if (peek()?.type === 'paren' && (peek() as any).value === ')') consume();
      return val;
    }
    
    consume();
    return null;
  }
  
  return parseExpression();
}

/**
 * Evaluate a single cell. If the raw value starts with '=', parse and evaluate the formula.
 * Otherwise return the raw value.
 */
export function evaluateCell(
  row: number,
  col: number,
  data: SheetData,
  sheets: SheetLookup = {},
  currentSheet: string = 'Sheet1',
  evaluatingSet?: Set<string>
): CellValue {
  const raw = data[row]?.[col];
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string' || !raw.startsWith('=')) return raw;
  
  const key = `${row},${col}`;
  const evaluating = evaluatingSet || new Set<string>();
  if (evaluating.has(key)) return '#CIRC!';
  evaluating.add(key);
  
  try {
    const formula = raw.slice(1); // remove '='
    const tokens = tokenize(formula);
    
    const ctx: EvalContext = {
      data,
      sheets,
      currentSheet,
      evaluating,
      evaluate: (r, c, d) => evaluateCell(r, c, d, sheets, currentSheet, evaluating),
    };
    
    const result = evaluateTokens(tokens, ctx);
    return result;
  } catch (e) {
    return '#ERROR!';
  } finally {
    evaluating.delete(key);
  }
}

/**
 * Evaluate all cells in a sheet, returning a 2D array of display values.
 */
export function evaluateSheet(data: SheetData, sheets: SheetLookup = {}, currentSheet: string = 'Sheet1'): SheetData {
  const result: SheetData = [];
  for (let r = 0; r < data.length; r++) {
    const row: CellValue[] = [];
    for (let c = 0; c < (data[r]?.length ?? 0); c++) {
      row.push(evaluateCell(r, c, data, sheets, currentSheet));
    }
    result.push(row);
  }
  return result;
}

/**
 * Check if a cell value is a formula
 */
export function isFormula(value: CellValue): boolean {
  return typeof value === 'string' && value.startsWith('=');
}
