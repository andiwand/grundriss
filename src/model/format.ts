// The format of the numbers in the texts of the app and the exports: the decimal mark and the
// grouping of the language. The model has no DOM, so the app sets the locale here.

let locale = "en";

/** Sets the locale of the numbers, for example "de-AT". */
export function setNumberLocale(next: string): void {
  locale = next;
}

export const numberLocale = (): string => locale;

/** A number with exactly `digits` digits after the decimal mark, in the locale. */
export function fmt(value: number, digits = 2): string {
  return value.toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: Math.abs(value) >= 10000,
  });
}
