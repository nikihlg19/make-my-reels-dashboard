
import { Project, TeamMember, CalendarEvent, Client } from './types';

export const INITIAL_TEAM: TeamMember[] = [];

export const INITIAL_PROJECTS: Project[] = [];

export const INITIAL_CLIENTS: Client[] = [];

export const INITIAL_EVENTS: CalendarEvent[] = [];

// Logistics Configurations
export const MILEAGE_RATE_PER_KM = Number(import.meta.env.VITE_MILEAGE_RATE_PER_KM) || 10; // Rupees per km

export const parseTime = (timeVal: any): string | undefined => {
  if (timeVal === null || timeVal === undefined || timeVal === '') return undefined;

  if (typeof timeVal === 'string') {
    // Already HH:mm
    if (/^\d{1,2}:\d{2}$/.test(timeVal)) {
      return timeVal.padStart(5, '0');
    }
    // Extract HH:mm from string like "Sat Dec 30 1899 09:00:00 GMT+0530"
    const match = timeVal.match(/(\d{2}):(\d{2}):\d{2}/);
    if (match) {
      return `${match[1]}:${match[2]}`;
    }
    // Try parsing as date
    const d = new Date(timeVal);
    if (!isNaN(d.getTime())) {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return timeVal;
  }

  if (timeVal instanceof Date) {
    return `${String(timeVal.getHours()).padStart(2, '0')}:${String(timeVal.getMinutes()).padStart(2, '0')}`;
  }

  if (typeof timeVal === 'number') {
    // Extract only the fractional part for time
    const fractionalPart = timeVal - Math.floor(timeVal);
    const totalSeconds = Math.round(fractionalPart * 86400);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  return String(timeVal);
};

export const parseDate = (dateVal: any): string | undefined => {
  if (!dateVal) return undefined;

  if (dateVal instanceof Date) {
    if (isNaN(dateVal.getTime())) return undefined;
    const year = dateVal.getUTCFullYear();
    const month = String(dateVal.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dateVal.getUTCDate()).padStart(2, '0');
    const res = `${year}-${month}-${day}`;
    if (res === '1970-01-01' || res === '1899-12-30' || res === '1899-12-31') return undefined;
    return res;
  }

  if (typeof dateVal === 'number') {
    // Excel date number
    const d = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) {
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      const res = `${year}-${month}-${day}`;
      if (res === '1970-01-01' || res === '1899-12-30') return undefined;
      return res;
    }
  }

  if (typeof dateVal === 'string') {
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
      if (dateVal === '1970-01-01' || dateVal === '1899-12-30') return undefined;
      return dateVal;
    }

    // Handle ISO strings directly to avoid local timezone shifting
    if (/^\d{4}-\d{2}-\d{2}T/.test(dateVal)) {
      const res = dateVal.split('T')[0];
      if (res === '1970-01-01' || res === '1899-12-30') return undefined;
      return res;
    }

    // Try to parse M-D-YYYY or MM/DD/YYYY
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) {
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      const res = `${year}-${month}-${day}`;
      if (res === '1970-01-01' || res === '1899-12-30') return undefined;
      return res;
    }

    // Fallback parsing for DD-MM-YYYY or DD/MM/YYYY
    const parts = dateVal.split(/[-/]/);
    if (parts.length === 3) {
      // If year is last
      if (parts[2].length === 4) {
        // Assume DD-MM-YYYY
        const res = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        if (res === '1970-01-01' || res === '1899-12-30') return undefined;
        return res;
      }
    }
  }

  return undefined;
};

export const formatDisplayDate = (dateStr: string | undefined): string => {
  if (!dateStr) return '';

  // If it's already in YYYY-MM-DD format, just reformat it to DD-MM-YYYY
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const parts = dateStr.split('-');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${day}-${month}-${year}`; // Consistent DD-MM-YYYY format
  } catch (e) {
    console.error('Date parse error for', dateStr, e);
    return dateStr;
  }
};
