/**
 * Split a schema script into individual statements.
 *
 * The naive `schema.split(';')` breaks as soon as a `--` comment contains a
 * semicolon: the statement is cut in half and SQLite reports "incomplete
 * input". Stripping line comments first makes an ordinary sentence in a
 * comment harmless. The schema contains no string literals with `--` in them,
 * so removing everything after `--` on a line is safe here.
 */
export function splitSchemaStatements(sql: string): string[] {
  return sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}
