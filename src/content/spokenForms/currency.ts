// Money amounts: "€50" -> "50 euros", "12,50 zł" -> "12 zloty 50 groszy",
// "$2.5M" -> "2.5 million dollars", "$10-$20" -> "10 to 20 dollars".
// espeak reads a currency symbol before the number ("euros fifty") and
// spells codes letter by letter ("pee el en").

interface Currency {
  one: string;
  many: string;
  minorOne?: string;
  minorMany?: string;
}

const DOLLAR: Currency = { one: "dollar", many: "dollars", minorOne: "cent", minorMany: "cents" };
const EURO: Currency = { one: "euro", many: "euros", minorOne: "cent", minorMany: "cents" };
const POUND: Currency = { one: "pound", many: "pounds", minorOne: "penny", minorMany: "pence" };
// Spelled for espeak: "groszy" would be read "gross-zee"
const ZLOTY: Currency = { one: "zloty", many: "zloty", minorOne: "grosh", minorMany: "groshy" };
const YEN: Currency = { one: "yen", many: "yen" };

function named(one: string, many: string, minorOne?: string, minorMany?: string): Currency {
  return { one, many, minorOne, minorMany };
}

// Symbols and codes written before the amount ("$5", "USD 5")
const PREFIX_CURRENCIES: Record<string, Currency> = {
  "US$": DOLLAR, "$": DOLLAR, "USD": DOLLAR,
  "CA$": named("Canadian dollar", "Canadian dollars", "cent", "cents"),
  "C$": named("Canadian dollar", "Canadian dollars", "cent", "cents"),
  "CAD": named("Canadian dollar", "Canadian dollars", "cent", "cents"),
  "A$": named("Australian dollar", "Australian dollars", "cent", "cents"),
  "AU$": named("Australian dollar", "Australian dollars", "cent", "cents"),
  "AUD": named("Australian dollar", "Australian dollars", "cent", "cents"),
  "R$": named("real", "reais", "centavo", "centavos"),
  "BRL": named("real", "reais", "centavo", "centavos"),
  "€": EURO, "EUR": EURO,
  "£": POUND, "GBP": POUND,
  "¥": YEN, "JPY": YEN,
  "CNY": named("yuan", "yuan"), "RMB": named("yuan", "yuan"),
  "₹": named("rupee", "rupees"), "INR": named("rupee", "rupees"),
  "₩": named("won", "won"), "KRW": named("won", "won"),
  "₽": named("ruble", "rubles"), "RUB": named("ruble", "rubles"),
  "₺": named("lira", "lira"), "TRY": named("lira", "lira"),
  "₴": named("hryvnia", "hryvnias"), "UAH": named("hryvnia", "hryvnias"),
  "₪": named("shekel", "shekels"), "ILS": named("shekel", "shekels"),
  "฿": named("baht", "baht"), "THB": named("baht", "baht"),
  "₱": named("peso", "pesos"), "MXN": named("peso", "pesos"),
  "₦": named("naira", "naira"), "NGN": named("naira", "naira"),
  "CHF": named("Swiss franc", "Swiss francs", "centime", "centimes"),
  "PLN": ZLOTY, "zł": ZLOTY,
  "CZK": named("koruna", "korunas"), "Kč": named("koruna", "korunas"),
  "HUF": named("forint", "forints"), "Ft": named("forint", "forints"),
  "SEK": named("Swedish krona", "Swedish kronor"),
  "NOK": named("Norwegian krone", "Norwegian kroner"),
  "DKK": named("Danish krone", "Danish kroner"),
  "kr": named("krona", "kronor"),
};

// Written after the amount ("50 €", "12,50 zł", "100 PLN"): every symbol and
// code except "$"-style ones, which always come first
const SUFFIX_KEYS = Object.keys(PREFIX_CURRENCIES).filter((key) => !key.includes("$"));

const MAGNITUDES: Record<string, string> = {
  k: "thousand", K: "thousand", thousand: "thousand",
  m: "million", M: "million", mn: "million", million: "million",
  b: "billion", B: "billion", bn: "billion", billion: "billion",
  t: "trillion", T: "trillion", tn: "trillion", trillion: "trillion",
  // Polish: "5 mln zł", "2 mld zł"
  mln: "million", mld: "billion",
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function alternation(keys: string[]): string {
  return [...keys].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
}

// "1,234.56", "1.234,56", "1 234,56" (also with no-break spaces), "12.5", "50"
const AMOUNT = String.raw`\d{1,3}(?:[,.\u00A0\u202F ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?`;
// Words may follow a space ("€5 million"); single letters must touch the number ("$5m", not "$5 t-shirt")
const MAGNITUDE = String.raw`(?:((?:\s?(?:thousand|million|billion|trillion|bn|mn|tn|mln|mld))|[kKmMbBtT])(?![\p{L}\d-]))?`;
const PREFIX = alternation(Object.keys(PREFIX_CURRENCIES));
const SUFFIX = alternation(SUFFIX_KEYS);
const DASH = String.raw`\s*[-–]\s*`;
// "$50 USD": the repeated code is dropped
const TRAILING_CODE = alternation(Object.keys(PREFIX_CURRENCIES).filter((key) => /^[A-Z]{3}$/.test(key)));

// Groups: currency, amount, magnitude, [range: amount, magnitude]
const PREFIX_PATTERN = new RegExp(
  String.raw`(?<![\p{L}\d])(${PREFIX})\s?(${AMOUNT})${MAGNITUDE}(?:${DASH}(?:${PREFIX})?\s?(${AMOUNT})${MAGNITUDE})?(?:\s(?:${TRAILING_CODE})(?![\p{L}]))?`,
  "gu",
);
// Groups: amount, magnitude, [range: amount, magnitude], currency
const SUFFIX_PATTERN = new RegExp(
  String.raw`(?<![\p{L}\d.,])(${AMOUNT})${MAGNITUDE}(?:${DASH}(${AMOUNT})${MAGNITUDE})?\s?(${SUFFIX})(?![\p{L}\d])`,
  "gu",
);

interface ParsedAmount {
  whole: string;
  fraction: string;
}

/** The last "." or "," is the decimal point unless exactly three digits follow it ("1,299", "1.299" are thousands). */
function parseAmount(amount: string): ParsedAmount {
  const compact = amount.replace(/[\u00A0\u202F ]/g, "");
  const decimal = /[.,](\d{1,2}|\d{4,})$/.exec(compact);
  if (!decimal) {
    return { whole: compact.replace(/[.,]/g, ""), fraction: "" };
  }
  const whole = compact.slice(0, decimal.index).replace(/[.,]/g, "");
  return { whole: whole || "0", fraction: decimal[1] };
}

function plainNumber({ whole, fraction }: ParsedAmount): string {
  return fraction ? `${whole}.${fraction}` : whole;
}

/** "12" + "50" -> "12 dollars 50 cents"; "0" + "50" -> "50 cents"; "1" -> "1 dollar" */
function majorAndMinor(parsed: ParsedAmount, currency: Currency): string {
  const major = `${parsed.whole} ${parsed.whole === "1" ? currency.one : currency.many}`;
  const hasMinor = parsed.fraction.length === 2 && currency.minorMany !== undefined;
  if (!hasMinor) {
    return parsed.fraction && !/^0+$/.test(parsed.fraction) ? `${plainNumber(parsed)} ${currency.many}` : major;
  }
  const cents = String(Number(parsed.fraction));
  if (cents === "0") {
    return major;
  }
  const minor = `${cents} ${cents === "1" ? currency.minorOne : currency.minorMany}`;
  return parsed.whole === "0" ? minor : `${major} ${minor}`;
}

function withMagnitude(amount: string, magnitude: string | undefined): string {
  const parsed = plainNumber(parseAmount(amount));
  return magnitude ? `${parsed} ${MAGNITUDES[magnitude.trim()]}` : parsed;
}

function spokenMoney(currency: Currency, amount: string, magnitude?: string, toAmount?: string, toMagnitude?: string): string {
  if (toAmount !== undefined) {
    // "$1-2M": the magnitude after the range applies to both ends
    return `${withMagnitude(amount, magnitude ?? toMagnitude)} to ${withMagnitude(toAmount, toMagnitude)} ${currency.many}`;
  }
  if (magnitude) {
    return `${withMagnitude(amount, magnitude)} ${currency.many}`;
  }
  return majorAndMinor(parseAmount(amount), currency);
}

/** Speak money amounts in any common currency the way people say them. */
export function speakCurrencies(text: string): string {
  return text
    .replace(PREFIX_PATTERN, (_match, symbol: string, amount: string, magnitude?: string, toAmount?: string, toMagnitude?: string) =>
      spokenMoney(PREFIX_CURRENCIES[symbol], amount, magnitude, toAmount, toMagnitude))
    .replace(SUFFIX_PATTERN, (_match, amount: string, magnitude: string | undefined, toAmount: string | undefined, toMagnitude: string | undefined, symbol: string) =>
      spokenMoney(PREFIX_CURRENCIES[symbol], amount, magnitude, toAmount, toMagnitude));
}
