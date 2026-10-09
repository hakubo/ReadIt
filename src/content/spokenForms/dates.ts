// Dates: "2024-01-15", "15.01.2024", "1/15/2024", "Jan 15" -> "January 15th, 2024"
// (American voices) or "15th January 2024" (other voices). espeak reads
// numeric dates digit group by digit group with "dash"/"slash" in between.

/** How the voice says dates, and how an ambiguous "01/02/2024" is read. */
export type DateOrder = "MDY" | "DMY";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_ABBREVIATIONS: Record<string, string> = {
  jan: "January", feb: "February", mar: "March", apr: "April", jun: "June", jul: "July",
  aug: "August", sep: "September", sept: "September", oct: "October", nov: "November", dec: "December",
};

const MONTH_NAMES = MONTHS.join("|");

export function ordinal(day: number): string {
  const lastTwo = day % 100;
  if (lastTwo >= 11 && lastTwo <= 13) {
    return `${day}th`;
  }
  const suffix = ["th", "st", "nd", "rd"][day % 10] ?? "th";
  return `${day}${suffix}`;
}

/** "24" -> 2024, "87" -> 1987: two-digit years up to ten years ahead are this century. */
function fullYear(year: string): number {
  if (year.length === 4) {
    return Number(year);
  }
  const short = Number(year);
  const centuryCutoff = (new Date().getFullYear() % 100) + 10;
  return short <= centuryCutoff ? 2000 + short : 1900 + short;
}

function isValidDate(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function spokenDate(year: number, month: number, day: number, order: DateOrder): string {
  const monthName = MONTHS[month - 1];
  return order === "MDY" ? `${monthName} ${ordinal(day)}, ${year}` : `${ordinal(day)} ${monthName} ${year}`;
}

/** Day and month of "a/b/yyyy": unambiguous when one part is over 12, otherwise the voice's convention. */
function dayAndMonth(first: number, second: number, order: DateOrder): [number, number] {
  if (first > 12) {
    return [first, second];
  }
  if (second > 12) {
    return [second, first];
  }
  return order === "MDY" ? [second, first] : [first, second];
}

function speakNumericDates(text: string, order: DateOrder): string {
  return text
    // ISO and "2024/01/15": year first is always year-month-day
    .replace(/(?<![\d./-])(\d{4})([-/])(\d{1,2})\2(\d{1,2})(?![\d./-])/g, (match, year: string, _sep, month: string, day: string) =>
      isValidDate(Number(month), Number(day)) ? spokenDate(Number(year), Number(month), Number(day), order) : match)
    // "15.01.2024" is day-month-year in every country that writes it
    .replace(/(?<![\d.])(\d{1,2})\.(\d{1,2})\.(\d{4})(?![\d.])/g, (match, day: string, month: string, year: string) =>
      isValidDate(Number(month), Number(day)) ? spokenDate(Number(year), Number(month), Number(day), order) : match)
    // "1/15/2024", "15/01/24", "15-01-2024"
    .replace(/(?<![\d./-])(\d{1,2})([/-])(\d{1,2})\2(\d{4}|\d{2})(?![\d./-])/g, (match, first: string, _sep, second: string, year: string) => {
      const [day, month] = dayAndMonth(Number(first), Number(second), order);
      return isValidDate(month, day) ? spokenDate(fullYear(year), month, day, order) : match;
    });
}

function expandMonthAbbreviations(text: string): string {
  const abbreviations = Object.keys(MONTH_ABBREVIATIONS).join("|");
  return text
    // "Jan 15", "Jan. 15"
    .replace(new RegExp(`\\b(${abbreviations})\\.?(?=\\s+\\d)`, "gi"), (match, abbreviation: string) =>
      /^[A-Z]/.test(abbreviation) ? MONTH_ABBREVIATIONS[abbreviation.toLowerCase()] : match)
    // "15 Jan 2024"
    .replace(new RegExp(`(?<=\\d\\s)(${abbreviations})\\b\\.?`, "gi"), (match, abbreviation: string) =>
      /^[A-Z]/.test(abbreviation) ? MONTH_ABBREVIATIONS[abbreviation.toLowerCase()] : match);
}

/** "January 15" -> "January 15th", "15 January" -> "15th January": people say the day as an ordinal. */
function ordinalDays(text: string): string {
  return text
    .replace(new RegExp(`\\b(${MONTH_NAMES})\\s+(\\d{1,2})(?![\\d:.]|st|nd|rd|th)\\b`, "g"), (match, month: string, day: string) =>
      Number(day) >= 1 && Number(day) <= 31 ? `${month} ${ordinal(Number(day))}` : match)
    .replace(new RegExp(`(?<![\\d.,])\\b(\\d{1,2})\\s+(${MONTH_NAMES})\\b`, "g"), (match, day: string, month: string) =>
      Number(day) >= 1 && Number(day) <= 31 ? `${ordinal(Number(day))} ${month}` : match);
}

export function speakDates(text: string, order: DateOrder): string {
  return ordinalDays(expandMonthAbbreviations(speakNumericDates(text, order)));
}
