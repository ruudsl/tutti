/**
 * Holiday Service for Dutch School Holidays
 *
 * This service provides hardcoded Dutch school holiday data for reliability,
 * as external APIs can be unreliable. Includes both school holidays (by region)
 * and national holidays.
 */

import logger from '../utils/logger';

// Dutch regions for school holidays
export type DutchRegion = 'noord' | 'midden' | 'zuid' | 'all';

export interface SchoolHoliday {
    name: string;
    nameDutch: string;
    region: DutchRegion;
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
    year: number;
    holidayType: 'kerst' | 'voorjaar' | 'mei' | 'zomer' | 'herfst' | 'national';
}

/**
 * Dutch national holidays (same for all regions)
 */
function getNationalHolidays(year: number): SchoolHoliday[] {
    const holidays: SchoolHoliday[] = [];

    // Nieuwjaarsdag (New Year's Day) - January 1
    holidays.push({
        name: "New Year's Day",
        nameDutch: 'Nieuwjaarsdag',
        region: 'all',
        startDate: `${year}-01-01`,
        endDate: `${year}-01-01`,
        year,
        holidayType: 'national',
    });

    // Koningsdag (King's Day) - April 27 (or April 26 if 27th is Sunday)
    const koningsdag = new Date(year, 3, 27);
    const koningsdagDate = koningsdag.getDay() === 0 ? `${year}-04-26` : `${year}-04-27`;
    holidays.push({
        name: "King's Day",
        nameDutch: 'Koningsdag',
        region: 'all',
        startDate: koningsdagDate,
        endDate: koningsdagDate,
        year,
        holidayType: 'national',
    });

    // Bevrijdingsdag (Liberation Day) - May 5
    holidays.push({
        name: 'Liberation Day',
        nameDutch: 'Bevrijdingsdag',
        region: 'all',
        startDate: `${year}-05-05`,
        endDate: `${year}-05-05`,
        year,
        holidayType: 'national',
    });

    // Easter-related holidays (calculated from Easter Sunday)
    const easterSunday = getEasterSunday(year);

    // Goede Vrijdag (Good Friday) - 2 days before Easter
    const goodFriday = new Date(easterSunday);
    goodFriday.setDate(goodFriday.getDate() - 2);
    holidays.push({
        name: 'Good Friday',
        nameDutch: 'Goede Vrijdag',
        region: 'all',
        startDate: formatDate(goodFriday),
        endDate: formatDate(goodFriday),
        year,
        holidayType: 'national',
    });

    // Eerste Paasdag (Easter Sunday)
    holidays.push({
        name: 'Easter Sunday',
        nameDutch: 'Eerste Paasdag',
        region: 'all',
        startDate: formatDate(easterSunday),
        endDate: formatDate(easterSunday),
        year,
        holidayType: 'national',
    });

    // Tweede Paasdag (Easter Monday)
    const easterMonday = new Date(easterSunday);
    easterMonday.setDate(easterMonday.getDate() + 1);
    holidays.push({
        name: 'Easter Monday',
        nameDutch: 'Tweede Paasdag',
        region: 'all',
        startDate: formatDate(easterMonday),
        endDate: formatDate(easterMonday),
        year,
        holidayType: 'national',
    });

    // Hemelvaartsdag (Ascension Day) - 39 days after Easter
    const ascension = new Date(easterSunday);
    ascension.setDate(ascension.getDate() + 39);
    holidays.push({
        name: 'Ascension Day',
        nameDutch: 'Hemelvaartsdag',
        region: 'all',
        startDate: formatDate(ascension),
        endDate: formatDate(ascension),
        year,
        holidayType: 'national',
    });

    // Eerste Pinksterdag (Whit Sunday) - 49 days after Easter
    const whitSunday = new Date(easterSunday);
    whitSunday.setDate(whitSunday.getDate() + 49);
    holidays.push({
        name: 'Whit Sunday',
        nameDutch: 'Eerste Pinksterdag',
        region: 'all',
        startDate: formatDate(whitSunday),
        endDate: formatDate(whitSunday),
        year,
        holidayType: 'national',
    });

    // Tweede Pinksterdag (Whit Monday) - 50 days after Easter
    const whitMonday = new Date(easterSunday);
    whitMonday.setDate(whitMonday.getDate() + 50);
    holidays.push({
        name: 'Whit Monday',
        nameDutch: 'Tweede Pinksterdag',
        region: 'all',
        startDate: formatDate(whitMonday),
        endDate: formatDate(whitMonday),
        year,
        holidayType: 'national',
    });

    // Eerste Kerstdag (Christmas Day) - December 25
    holidays.push({
        name: 'Christmas Day',
        nameDutch: 'Eerste Kerstdag',
        region: 'all',
        startDate: `${year}-12-25`,
        endDate: `${year}-12-25`,
        year,
        holidayType: 'national',
    });

    // Tweede Kerstdag (Boxing Day) - December 26
    holidays.push({
        name: 'Boxing Day',
        nameDutch: 'Tweede Kerstdag',
        region: 'all',
        startDate: `${year}-12-26`,
        endDate: `${year}-12-26`,
        year,
        holidayType: 'national',
    });

    return holidays;
}

/**
 * Calculate Easter Sunday using the Anonymous Gregorian algorithm
 */
function getEasterSunday(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;

    return new Date(year, month - 1, day);
}

function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Hardcoded Dutch school holidays for 2024-2027
 * These are official dates from the Dutch government (rijksoverheid.nl)
 */
function getSchoolHolidaysData(): SchoolHoliday[] {
    const holidays: SchoolHoliday[] = [];

    // ====================
    // 2024-2025 SCHOOL YEAR
    // ====================

    // Herfstvakantie 2024 (Week 43 or 44 depending on region)
    holidays.push(
        { name: 'Autumn Holiday', nameDutch: 'Herfstvakantie', region: 'noord', startDate: '2024-10-19', endDate: '2024-10-27', year: 2024, holidayType: 'herfst' },
        { name: 'Autumn Holiday', nameDutch: 'Herfstvakantie', region: 'midden', startDate: '2024-10-19', endDate: '2024-10-27', year: 2024, holidayType: 'herfst' },
        { name: 'Autumn Holiday', nameDutch: 'Herfstvakantie', region: 'zuid', startDate: '2024-10-26', endDate: '2024-11-03', year: 2024, holidayType: 'herfst' },
    );

    // Kerstvakantie 2024-2025
    holidays.push({
        name: 'Christmas Holiday', nameDutch: 'Kerstvakantie', region: 'all',
        startDate: '2024-12-21', endDate: '2025-01-05', year: 2024, holidayType: 'kerst',
    });

    // Voorjaarsvakantie 2025
    holidays.push(
        { name: 'Spring Break', nameDutch: 'Voorjaarsvakantie', region: 'noord', startDate: '2025-02-22', endDate: '2025-03-02', year: 2025, holidayType: 'voorjaar' },
        { name: 'Spring Break', nameDutch: 'Voorjaarsvakantie', region: 'midden', startDate: '2025-02-22', endDate: '2025-03-02', year: 2025, holidayType: 'voorjaar' },
        { name: 'Spring Break', nameDutch: 'Voorjaarsvakantie', region: 'zuid', startDate: '2025-03-01', endDate: '2025-03-09', year: 2025, holidayType: 'voorjaar' },
    );

    // Meivakantie 2025
    holidays.push({
        name: 'May Holiday', nameDutch: 'Meivakantie', region: 'all',
        startDate: '2025-04-26', endDate: '2025-05-11', year: 2025, holidayType: 'mei',
    });

    // Zomervakantie 2025
    holidays.push(
        { name: 'Summer Holiday', nameDutch: 'Zomervakantie', region: 'noord', startDate: '2025-07-19', endDate: '2025-08-31', year: 2025, holidayType: 'zomer' },
        { name: 'Summer Holiday', nameDutch: 'Zomervakantie', region: 'midden', startDate: '2025-07-12', endDate: '2025-08-24', year: 2025, holidayType: 'zomer' },
        { name: 'Summer Holiday', nameDutch: 'Zomervakantie', region: 'zuid', startDate: '2025-07-05', endDate: '2025-08-17', year: 2025, holidayType: 'zomer' },
    );

    // ====================
    // 2025-2026 SCHOOL YEAR
    // ====================

    // Herfstvakantie 2025
    holidays.push(
        { name: 'Autumn Holiday', nameDutch: 'Herfstvakantie', region: 'noord', startDate: '2025-10-18', endDate: '2025-10-26', year: 2025, holidayType: 'herfst' },
        { name: 'Autumn Holiday', nameDutch: 'Herfstvakantie', region: 'midden', startDate: '2025-10-18', endDate: '2025-10-26', year: 2025, holidayType: 'herfst' },
        { name: 'Autumn Holiday', nameDutch: 'Herfstvakantie', region: 'zuid', startDate: '2025-10-25', endDate: '2025-11-02', year: 2025, holidayType: 'herfst' },
    );

    // Kerstvakantie 2025-2026
    holidays.push({
        name: 'Christmas Holiday', nameDutch: 'Kerstvakantie', region: 'all',
        startDate: '2025-12-20', endDate: '2026-01-04', year: 2025, holidayType: 'kerst',
    });

    // Voorjaarsvakantie 2026
    holidays.push(
        { name: 'Spring Break', nameDutch: 'Voorjaarsvakantie', region: 'noord', startDate: '2026-02-21', endDate: '2026-03-01', year: 2026, holidayType: 'voorjaar' },
        { name: 'Spring Break', nameDutch: 'Voorjaarsvakantie', region: 'midden', startDate: '2026-02-14', endDate: '2026-02-22', year: 2026, holidayType: 'voorjaar' },
        { name: 'Spring Break', nameDutch: 'Voorjaarsvakantie', region: 'zuid', startDate: '2026-02-21', endDate: '2026-03-01', year: 2026, holidayType: 'voorjaar' },
    );

    // Meivakantie 2026
    holidays.push({
        name: 'May Holiday', nameDutch: 'Meivakantie', region: 'all',
        startDate: '2026-04-25', endDate: '2026-05-10', year: 2026, holidayType: 'mei',
    });

    // Zomervakantie 2026
    holidays.push(
        { name: 'Summer Holiday', nameDutch: 'Zomervakantie', region: 'noord', startDate: '2026-07-04', endDate: '2026-08-16', year: 2026, holidayType: 'zomer' },
        { name: 'Summer Holiday', nameDutch: 'Zomervakantie', region: 'midden', startDate: '2026-07-18', endDate: '2026-08-30', year: 2026, holidayType: 'zomer' },
        { name: 'Summer Holiday', nameDutch: 'Zomervakantie', region: 'zuid', startDate: '2026-07-11', endDate: '2026-08-23', year: 2026, holidayType: 'zomer' },
    );

    // ====================
    // 2026-2027 SCHOOL YEAR
    // ====================

    // Herfstvakantie 2026
    holidays.push(
        { name: 'Autumn Holiday', nameDutch: 'Herfstvakantie', region: 'noord', startDate: '2026-10-17', endDate: '2026-10-25', year: 2026, holidayType: 'herfst' },
        { name: 'Autumn Holiday', nameDutch: 'Herfstvakantie', region: 'midden', startDate: '2026-10-17', endDate: '2026-10-25', year: 2026, holidayType: 'herfst' },
        { name: 'Autumn Holiday', nameDutch: 'Herfstvakantie', region: 'zuid', startDate: '2026-10-24', endDate: '2026-11-01', year: 2026, holidayType: 'herfst' },
    );

    // Kerstvakantie 2026-2027
    holidays.push({
        name: 'Christmas Holiday', nameDutch: 'Kerstvakantie', region: 'all',
        startDate: '2026-12-19', endDate: '2027-01-03', year: 2026, holidayType: 'kerst',
    });

    // Voorjaarsvakantie 2027
    holidays.push(
        { name: 'Spring Break', nameDutch: 'Voorjaarsvakantie', region: 'noord', startDate: '2027-02-20', endDate: '2027-02-28', year: 2027, holidayType: 'voorjaar' },
        { name: 'Spring Break', nameDutch: 'Voorjaarsvakantie', region: 'midden', startDate: '2027-02-27', endDate: '2027-03-07', year: 2027, holidayType: 'voorjaar' },
        { name: 'Spring Break', nameDutch: 'Voorjaarsvakantie', region: 'zuid', startDate: '2027-02-13', endDate: '2027-02-21', year: 2027, holidayType: 'voorjaar' },
    );

    // Meivakantie 2027
    holidays.push({
        name: 'May Holiday', nameDutch: 'Meivakantie', region: 'all',
        startDate: '2027-05-01', endDate: '2027-05-09', year: 2027, holidayType: 'mei',
    });

    // Zomervakantie 2027
    holidays.push(
        { name: 'Summer Holiday', nameDutch: 'Zomervakantie', region: 'noord', startDate: '2027-07-17', endDate: '2027-08-29', year: 2027, holidayType: 'zomer' },
        { name: 'Summer Holiday', nameDutch: 'Zomervakantie', region: 'midden', startDate: '2027-07-10', endDate: '2027-08-22', year: 2027, holidayType: 'zomer' },
        { name: 'Summer Holiday', nameDutch: 'Zomervakantie', region: 'zuid', startDate: '2027-07-03', endDate: '2027-08-15', year: 2027, holidayType: 'zomer' },
    );

    return holidays;
}

/**
 * Get all holidays (school holidays + national holidays) for a given year and region
 */
export function getHolidaysForYearAndRegion(year: number, region: DutchRegion): SchoolHoliday[] {
    const schoolHolidays = getSchoolHolidaysData();
    const nationalHolidays = getNationalHolidays(year);

    // Filter school holidays by year and region
    const filteredSchoolHolidays = schoolHolidays.filter(h => {
        // Year matching (holidays spanning years like kerstvakantie have year of start date)
        const holidayYear = parseInt(h.startDate.substring(0, 4));
        const holidayEndYear = parseInt(h.endDate.substring(0, 4));
        const matchesYear = holidayYear === year || holidayEndYear === year;

        // Region matching
        const matchesRegion = h.region === 'all' || h.region === region || region === 'all';

        return matchesYear && matchesRegion;
    });

    // Combine and sort by start date
    const allHolidays = [...filteredSchoolHolidays, ...nationalHolidays];
    allHolidays.sort((a, b) => a.startDate.localeCompare(b.startDate));

    return allHolidays;
}

/**
 * Get holidays for a date range and region
 */
export function getHolidaysInRange(
    startDate: string,
    endDate: string,
    region: DutchRegion
): SchoolHoliday[] {
    const startYear = parseInt(startDate.substring(0, 4));
    const endYear = parseInt(endDate.substring(0, 4));

    const holidays: SchoolHoliday[] = [];

    for (let year = startYear; year <= endYear; year++) {
        holidays.push(...getHolidaysForYearAndRegion(year, region));
    }

    // Filter to the exact date range
    return holidays.filter(h => {
        return h.endDate >= startDate && h.startDate <= endDate;
    });
}

/**
 * Check if a specific date falls within a holiday period
 */
export function isDateInHoliday(date: string, region: DutchRegion): SchoolHoliday | null {
    const year = parseInt(date.substring(0, 4));
    const holidays = getHolidaysForYearAndRegion(year, region);

    return holidays.find(h => date >= h.startDate && date <= h.endDate) || null;
}

/**
 * Get the next upcoming holiday for a region
 */
export function getNextHoliday(region: DutchRegion): SchoolHoliday | null {
    const today = new Date().toISOString().split('T')[0];
    const year = parseInt(today.substring(0, 4));

    // Check this year and next year
    const holidays = [
        ...getHolidaysForYearAndRegion(year, region),
        ...getHolidaysForYearAndRegion(year + 1, region),
    ];

    return holidays.find(h => h.startDate > today) || null;
}

/**
 * Get current holiday if we're in one
 */
export function getCurrentHoliday(region: DutchRegion): SchoolHoliday | null {
    const today = new Date().toISOString().split('T')[0];
    return isDateInHoliday(today, region);
}

/**
 * Sync holidays from external API (stub for future implementation)
 * Currently returns hardcoded data for reliability
 */
export async function syncHolidaysFromExternalAPI(year: number): Promise<SchoolHoliday[]> {
    logger.info(`Returning hardcoded holidays for year ${year} (external API not implemented)`);

    // Return all holidays for the requested year
    const holidays: SchoolHoliday[] = [];

    // Add school holidays for all regions
    const schoolHolidays = getSchoolHolidaysData();
    holidays.push(...schoolHolidays.filter(h => {
        const holidayYear = parseInt(h.startDate.substring(0, 4));
        return holidayYear === year || holidayYear === year - 1; // Include holidays that span into the year
    }));

    // Add national holidays
    holidays.push(...getNationalHolidays(year));

    return holidays;
}

/**
 * Get available years with holiday data
 */
export function getAvailableYears(): number[] {
    return [2024, 2025, 2026, 2027];
}

/**
 * Get regions
 */
export function getRegions(): { value: DutchRegion; label: string; labelDutch: string }[] {
    return [
        { value: 'noord', label: 'North', labelDutch: 'Noord' },
        { value: 'midden', label: 'Middle', labelDutch: 'Midden' },
        { value: 'zuid', label: 'South', labelDutch: 'Zuid' },
    ];
}
