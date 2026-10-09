import { describe, expect, it } from "vitest";
import { speakWrittenForms, spokenFormsForVoice } from "../content/spokenForms";
import { speakCurrencies } from "../content/spokenForms/currency";
import { speakDates } from "../content/spokenForms/dates";
import { speakNumberShapes } from "../content/spokenForms/numbers";
import { speakRomanNumerals } from "../content/spokenForms/roman";
import { speakUnits } from "../content/spokenForms/units";

const US = { dateOrder: "MDY" as const };
const UK = { dateOrder: "DMY" as const };

describe("speakCurrencies", () => {
  it.each([
    ["It costs €50.", "It costs 50 euros."],
    ["It costs 50 €.", "It costs 50 euros."],
    ["It costs 50€.", "It costs 50 euros."],
    ["£20 or ¥100", "20 pounds or 100 yen"],
    ["Only $1 left", "Only 1 dollar left"],
    ["$12.50 total", "12 dollars 50 cents total"],
    ["$0.99 each", "99 cents each"],
    ["$1,299.00", "1299 dollars"],
    ["12,50 zł", "12 zloty 50 groshy"],
    ["1 234,56 zł", "1234 zloty 56 groshy"],
    ["100 PLN", "100 zloty"],
    ["PLN 100", "100 zloty"],
    ["5 mln zł", "5 million zloty"],
    ["1.234,56 €", "1234 euros 56 cents"],
    ["USD 50", "50 dollars"],
    ["$50 USD", "50 dollars"],
    ["Revenue hit $2.5M and $3B.", "Revenue hit 2.5 million dollars and 3 billion dollars."],
    ["€5bn deal", "5 billion euros deal"],
    ["$10K raise", "10 thousand dollars raise"],
    ["$10-$20 a month", "10 to 20 dollars a month"],
    ["$1-2M", "1 million to 2 million dollars"],
    ["10–20 zł", "10 to 20 zloty"],
    ["CHF 40", "40 Swiss francs"],
    ["₹500", "500 rupees"],
    ["R$30", "30 reais"],
  ])("%s", (input, expected) => {
    expect(speakCurrencies(input)).toBe(expected);
  });

  it("leaves plain numbers and a dollar t-shirt alone", () => {
    expect(speakCurrencies("We have 50 users and 3 more.")).toBe("We have 50 users and 3 more.");
    expect(speakCurrencies("a $5 t-shirt")).toBe("a 5 dollars t-shirt");
  });
});

describe("speakDates", () => {
  it.each([
    ["On 2024-01-15 we met.", "On January 15th, 2024 we met.", "On 15th January 2024 we met."],
    ["On 2024/01/15 we met.", "On January 15th, 2024 we met.", "On 15th January 2024 we met."],
    ["On 15.01.2024 we met.", "On January 15th, 2024 we met.", "On 15th January 2024 we met."],
    ["On 15/01/2024 we met.", "On January 15th, 2024 we met.", "On 15th January 2024 we met."],
    ["On 1/15/2024 we met.", "On January 15th, 2024 we met.", "On 15th January 2024 we met."],
    ["On 02/03/2024 we met.", "On February 3rd, 2024 we met.", "On 2nd March 2024 we met."],
    ["On 15-01-24 we met.", "On January 15th, 2024 we met.", "On 15th January 2024 we met."],
    ["Due Jan 5, 2025.", "Due January 5th, 2025.", "Due January 5th, 2025."],
    ["Due 21 Sept 2025.", "Due 21st September 2025.", "Due 21st September 2025."],
    ["On March 22 we ship.", "On March 22nd we ship.", "On March 22nd we ship."],
  ])("%s", (input, american, british) => {
    expect(speakDates(input, "MDY")).toBe(american);
    expect(speakDates(input, "DMY")).toBe(british);
  });

  it("leaves non-dates alone", () => {
    const text = "Version 1.2.3, score 3-2, call 555-1234, in March 2024, jan said 5 things.";
    expect(speakDates(text, "MDY")).toBe(text);
  });
});

describe("speakNumberShapes", () => {
  it.each([
    ["Open 24/7.", "Open 24 7."],
    ["It's 50/50.", "It's 50 50."],
    ["Rated 4.5/5.", "Rated 4.5 out of 5."],
    ["Add 1/2 cup and 1 3/4 cups.", "Add one half cup and 1 and three quarters cups."],
    ["Add ½ cup.", "Add one half cup."],
    ["Add 1 1/2 cups or 2½.", "Add 1 and a half cups or 2 and a half."],
    ["We are #1.", "We are number 1."],
    ["Screen 1920x1080.", "Screen 1920 by 1080."],
    ["The 1990s and the 2000s and the '80s.", "The nineteen nineties and the two thousands and the eighties."],
    ["See pp. 3-5 and p. 12.", "See pages 3 to 5 and page 12."],
    ["See fig. 2 and No. 5.", "See figure 2 and number 5."],
    ["Takes 10-20 minutes.", "Takes 10 to 20 minutes."],
    ["Ages 5-10 welcome.", "Ages 5 to 10 welcome."],
  ])("%s", (input, expected) => {
    expect(speakNumberShapes(input)).toBe(expected);
  });

  it("leaves scores, phone numbers, hex and other fractions alone", () => {
    const text = "It ended 3-2, call 555-1234, value 0x1F, on 9/11.";
    expect(speakNumberShapes(text)).toBe(text);
  });
});

describe("speakUnits", () => {
  it.each([
    ["File is 10GB, took 100ms, weighs 5kg.", "File is 10 gigabytes, took 100 milliseconds, weighs 5 kilograms."],
    ["Speed 60 km/h or 60mph.", "Speed 60 kilometers per hour or 60 miles per hour."],
    ["It is 25°C today.", "It is 25 degrees Celsius today."],
    ["Just 1 km away.", "Just 1 kilometer away."],
    ["A 6 ft wall, 3.2 GHz.", "A 6 feet wall, 3.2 gigahertz."],
  ])("%s", (input, expected) => {
    expect(speakUnits(input)).toBe(expected);
  });

  it("leaves ambiguous units alone", () => {
    const text = "Get 5G, 5m users, 5 in a row, 3 s.";
    expect(speakUnits(text)).toBe(text);
  });
});

describe("speakRomanNumerals", () => {
  it.each([
    ["World War II ended.", "World War 2 ended."],
    ["Henry VIII and Elizabeth II.", "Henry the Eighth and Elizabeth the Second."],
    ["Charles V ruled.", "Charles the Fifth ruled."],
    ["Final Fantasy VII is great.", "Final Fantasy 7 is great."],
    ["Read Part V.", "Read Part 5."],
    ["Pope Leo XIV spoke.", "Pope Leo the Fourteenth spoke."],
  ])("%s", (input, expected) => {
    expect(speakRomanNumerals(input)).toBe(expected);
  });

  it("leaves pronouns, letters and abbreviations alone", () => {
    const text = "Then I left. Plan B, vitamin C, the IV drip, Thanks George I think, Option X.";
    expect(speakRomanNumerals(text)).toBe(text);
  });
});

describe("speakWrittenForms", () => {
  it("combines everything in order", () => {
    expect(speakWrittenForms("On 2024-01-15 it cost €10-€20 for 70%-80% of 10GB → Settings.", US))
      .toBe("On January 15th, 2024 it cost 10 to 20 euros for 70 to 80 percent of 10 gigabytes, Settings.");
  });

  it("picks the date order from the voice and skips other languages", () => {
    expect(spokenFormsForVoice("af_heart")).toEqual(US);
    expect(spokenFormsForVoice("bf_emma")).toEqual(UK);
    expect(spokenFormsForVoice("ef_dora")).toBeNull();
  });
});
