// Units after a number: "10GB" -> "10 gigabytes", "60 km/h" -> "60
// kilometers per hour". espeak spells these letter by letter. Case matters
// ("MB" megabyte, "Mb" left alone), and ambiguous ones ("m", "g", "s", "in")
// are skipped: "5G", "5m users" and "5 in a row" would be misread.

type UnitName = [one: string, many: string];

function unit(one: string, many = `${one}s`): UnitName {
  return [one, many];
}

export const UNITS: Record<string, UnitName> = {
  // Time
  ns: unit("nanosecond"), ms: unit("millisecond"), sec: unit("second"), secs: unit("second"),
  min: unit("minute"), mins: unit("minute"), hr: unit("hour"), hrs: unit("hour"), h: unit("hour"),
  // Length, mass, volume
  mm: unit("millimeter"), cm: unit("centimeter"), km: unit("kilometer"),
  ft: unit("foot", "feet"), mi: unit("mile"),
  mg: unit("milligram"), kg: unit("kilogram"), lb: unit("pound"), lbs: unit("pound"), oz: unit("ounce"),
  ml: unit("milliliter"), mL: unit("milliliter"),
  // Speed
  "km/h": unit("kilometer per hour", "kilometers per hour"), kph: unit("kilometer per hour", "kilometers per hour"),
  mph: unit("mile per hour", "miles per hour"), "m/s": unit("meter per second", "meters per second"),
  // Data
  KB: unit("kilobyte"), kB: unit("kilobyte"), MB: unit("megabyte"), GB: unit("gigabyte"),
  TB: unit("terabyte"), PB: unit("petabyte"),
  kbps: unit("kilobit per second", "kilobits per second"), Kbps: unit("kilobit per second", "kilobits per second"),
  Mbps: unit("megabit per second", "megabits per second"), Gbps: unit("gigabit per second", "gigabits per second"),
  // Frequency, power
  Hz: unit("hertz", "hertz"), kHz: unit("kilohertz", "kilohertz"), MHz: unit("megahertz", "megahertz"),
  GHz: unit("gigahertz", "gigahertz"),
  W: unit("watt"), kW: unit("kilowatt"), kWh: unit("kilowatt hour"), mAh: unit("milliamp hour"),
  // Temperature
  "°C": unit("degree Celsius", "degrees Celsius"), "°F": unit("degree Fahrenheit", "degrees Fahrenheit"),
  "°": unit("degree"),
  // Screens
  px: unit("pixel"), fps: unit("frame per second", "frames per second"),
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const UNIT_ALTERNATION = Object.keys(UNITS)
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|");

// A unit right after a number, optionally one space between, never followed by a letter or digit
const UNIT_PATTERN = new RegExp(
  String.raw`(?<![\p{L}\d.,])(\d+(?:[.,]\d+)?)\s?(${UNIT_ALTERNATION})(?![\p{L}\d/])`,
  "gu",
);

export function speakUnits(text: string): string {
  return text.replace(UNIT_PATTERN, (_match, amount: string, symbol: string) => {
    const [one, many] = UNITS[symbol];
    return `${amount} ${amount === "1" ? one : many}`;
  });
}
