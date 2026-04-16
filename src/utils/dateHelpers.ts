/**
 * Safely parse a date string in multiple formats:
 * - ISO (YYYY-MM-DD)
 * - DD-MM-YYYY or DD-MM-YY (with - or / separators)
 */
export const parseDateSafe = (dateStr: string): Date | null => {
  if (!dateStr) return null;

  // Try standard ISO first (YYYY-MM-DD)
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;

  // Try splitting by - or / for DD-MM-YY or DD-MM-YYYY
  const parts = dateStr.split(/[-/]/);
  if (parts.length === 3) {
    const p1 = parseInt(parts[0], 10);
    const p2 = parseInt(parts[1], 10);
    const p3 = parseInt(parts[2], 10);

    // Heuristic: If first part > 12, it's definitely day. Or if last part is year.
    // Assuming DD-MM-YY or DD-MM-YYYY
    if (p1 <= 31 && p2 <= 12) {
      let year = p3;
      if (year < 100) year += 2000; // Handle YY -> 20YY
      return new Date(year, p2 - 1, p1);
    }
  }
  return null;
};
