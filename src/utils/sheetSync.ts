// Helper for stable IDs (prevents flickering when ID is missing in sheet)
export const generateStableId = (seed: string) => {
  let hash = 0;
  const str = seed.toString();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).substring(0, 9).toUpperCase();
};

// Safe JSON parser to prevent sync crashes
export const safeJsonParse = (str: any, fallback: any = []) => {
  if (!str) return fallback;
  if (typeof str !== 'string') return str;
  try {
    return JSON.parse(str);
  } catch (e) {
    console.warn("JSON Parse Error:", e);
    return fallback;
  }
};

// Helper to robustly parse dates from various formats (ISO, DD-MM-YYYY, Excel string)
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

// Helper to automatically convert regular Google Sheet URLs to export URLs
export const getExportUrl = (url: string) => {
  if (!url) return '';
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=xlsx`;
  }
  return url;
};
