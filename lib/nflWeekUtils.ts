/**
 * NFL Week Utilities
 * 
 * Re-exports week calculation functions from lib/nflPickEm.ts
 * for convenient importing when only week logic is needed.
 */

export {
  getThursdayOfWeek,
  calculateNFLWeekNumber,
} from "./nflPickEm";

// Additional week range utilities
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Get the full date range for an NFL week
 */
export function getNFLWeekRange(weekStartThursday: Date): {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
} {
  const start = new Date(weekStartThursday);
  start.setUTCHours(0, 0, 0, 0);
  
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 4); // Monday
  end.setUTCHours(23, 59, 59, 999);
  
  return {
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

/**
 * Get all weeks for an NFL season
 */
export function getNFLWeeksForSeason(season: number): Array<{
  weekNumber: number;
  startDate: Date;
  endDate: Date;
}> {
  const weeks = [];
  
  // Start from first Thursday in September
  const seasonStart = new Date(Date.UTC(season, 8, 1));
  
  // Get first Thursday (may need to import this if not already available)
  const getThursdayOfWeek = (date: Date): Date => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    const dayOfWeek = d.getUTCDay();
    const daysSinceThursday = (dayOfWeek - 4 + 7) % 7;
    d.setUTCDate(d.getUTCDate() - daysSinceThursday);
    return d;
  };
  
  let currentThursday = getThursdayOfWeek(seasonStart);
  
  if (currentThursday.getUTCMonth() < 8) {
    currentThursday.setUTCDate(currentThursday.getUTCDate() + 7);
  }
  
  // Generate 18 weeks (regular season)
  for (let weekNum = 1; weekNum <= 18; weekNum++) {
    const range = getNFLWeekRange(currentThursday);
    
    weeks.push({
      weekNumber: weekNum,
      startDate: range.start,
      endDate: range.end,
    });
    
    currentThursday.setUTCDate(currentThursday.getUTCDate() + 7);
  }
  
  return weeks;
}
