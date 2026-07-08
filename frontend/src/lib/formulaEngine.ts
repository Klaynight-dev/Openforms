/**
 * Moteur de formules minimaliste pour le tableur admin — écrit en TS, sans
 * dépendance ni `eval`. Supporte :
 *   - Fonctions d'agrégation sur une colonne : SUM(col), AVG(col), MIN(col),
 *     MAX(col), COUNT(col), MEDIAN(col)
 *   - Concaténation : CONCAT(a, b, "texte", ...)
 *   - Expressions arithmétiques simples entre nombres et références de colonne
 *     de la ligne courante : =colA + colB * 2
 *
 * Deux contextes d'évaluation :
 *   - `evaluateAggregate` : sur l'ensemble des lignes (pied de colonne).
 *   - `evaluateRowFormula` : sur une seule ligne (colonne de métadonnées calculée).
 */

export type Row = Record<string, unknown>;

function toNumbers(rows: Row[], col: string): number[] {
  return rows
    .map((r) => Number(r[col]))
    .filter((n) => Number.isFinite(n));
}

const AGGREGATIONS: Record<string, (values: number[]) => number> = {
  SUM: (v) => v.reduce((a, b) => a + b, 0),
  AVG: (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0),
  MIN: (v) => (v.length ? Math.min(...v) : 0),
  MAX: (v) => (v.length ? Math.max(...v) : 0),
  COUNT: (v) => v.length,
  MEDIAN: (v) => {
    if (!v.length) return 0;
    const s = [...v].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  },
};

/** Évalue une formule d'agrégation de colonne, ex: "SUM(note)" ou "AVG(age)". */
export function evaluateAggregate(formula: string, rows: Row[]): string {
  const m = formula.trim().match(/^([A-Z]+)\(([^)]*)\)$/i);
  if (!m) return "";
  const fn = m[1].toUpperCase();
  const col = m[2].trim();
  const agg = AGGREGATIONS[fn];
  if (!agg) return "#FN?";
  const result = agg(toNumbers(rows, col));
  return Number.isInteger(result) ? String(result) : result.toFixed(2);
}

/**
 * Évalue une formule au niveau d'une ligne.
 *   - CONCAT(...)         -> concatène valeurs de colonnes / littéraux
 *   - =expr arithmétique  -> +, -, *, /, parenthèses, refs de colonne, nombres
 */
export function evaluateRowFormula(formula: string, row: Row): string {
  const f = formula.trim();

  const concat = f.match(/^CONCAT\((.*)\)$/i);
  if (concat) {
    const parts = splitArgs(concat[1]);
    return parts
      .map((p) => {
        const lit = p.match(/^"(.*)"$/);
        if (lit) return lit[1];
        return String(row[p.trim()] ?? "");
      })
      .join("");
  }

  const expr = f.startsWith("=") ? f.slice(1) : f;
  try {
    return String(evalArithmetic(expr, row));
  } catch {
    return "#ERR";
  }
}

function splitArgs(input: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let cur = "";
  let inStr = false;
  for (const ch of input) {
    if (ch === '"') inStr = !inStr;
    if (ch === "," && depth === 0 && !inStr) {
      args.push(cur);
      cur = "";
      continue;
    }
    if (!inStr) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
    }
    cur += ch;
  }
  if (cur.trim()) args.push(cur);
  return args;
}

// --- Évaluateur arithmétique récursif (aucun eval) ---
// Grammaire :  expr := term (('+'|'-') term)*
//              term := factor (('*'|'/') factor)*
//              factor := number | ident | '(' expr ')' | '-' factor
function evalArithmetic(input: string, row: Row): number {
  const tokens = tokenize(input);
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr(): number {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }
  function parseTerm(): number {
    let value = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = next();
      const rhs = parseFactor();
      value = op === "*" ? value * rhs : value / rhs;
    }
    return value;
  }
  function parseFactor(): number {
    const t = next();
    if (t === "-") return -parseFactor();
    if (t === "(") {
      const v = parseExpr();
      next(); // ')'
      return v;
    }
    if (t === undefined) throw new Error("fin inattendue");
    if (/^[0-9.]+$/.test(t)) return Number(t);
    const v = Number(row[t]);
    return Number.isFinite(v) ? v : 0;
  }

  const result = parseExpr();
  if (!Number.isFinite(result)) throw new Error("résultat non fini");
  return Math.round(result * 1e6) / 1e6;
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const re = /\s*([A-Za-z_][A-Za-z0-9_]*|[0-9]*\.?[0-9]+|[()+\-*/])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) tokens.push(m[1]);
  return tokens;
}
