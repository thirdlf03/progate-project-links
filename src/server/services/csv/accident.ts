import { promises as fs } from "node:fs";
import path from "node:path";

export type CsvRow = Record<string, string>;

let cache: { rows: CsvRow[]; mtimeMs: number; path: string } | null = null;

function parseCsvLine(line: string): string[] {
  const res: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ",") {
        res.push(cur);
        cur = "";
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  res.push(cur);
  return res;
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]!).map((h) => h.trim());
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]!);
    const row: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]!] = (cols[j] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

export async function loadAccidentCsv(csvPath?: string): Promise<CsvRow[]> {
  const resolvedPath =
    csvPath ??
    process.env.ACCIDENT_CSV_PATH ??
    path.join(process.cwd(), "accident_summary.csv");
  const stat = await fs.stat(resolvedPath);
  if (cache && cache.path === resolvedPath && cache.mtimeMs === stat.mtimeMs) {
    return cache.rows;
  }
  const data = await fs.readFile(resolvedPath, "utf8");
  const rows = parseCsv(data);
  cache = { rows, mtimeMs: stat.mtimeMs, path: resolvedPath };
  return rows;
}

export type Selection = { row: CsvRow; score: number };

export function selectRelevantRows(
  rows: CsvRow[],
  question: string,
  topK = 20,
): Selection[] {
  const q = question.toLowerCase();
  const tokens = q.split(/[^a-zA-Z0-9ぁ-んァ-ヶ一-龠ー]+/).filter(Boolean);
  const selections: Selection[] = rows.map((row) => {
    const text = Object.values(row).join(" ").toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (t.length === 0) continue;
      // basic frequency scoring
      const occurrences = text.split(t).length - 1;
      score += occurrences;
    }
    return { row, score };
  });
  selections.sort((a, b) => b.score - a.score);
  return selections.slice(0, topK);
}

export function toCompactJson(selections: Selection[]): string {
  const compact = selections.map((s) => s.row);
  return JSON.stringify(compact).slice(0, 90_000); // keep payload under ~100KB
}
