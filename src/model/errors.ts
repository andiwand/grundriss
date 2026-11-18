// An error for the user whose text has values, for example a status code or a file name. The
// message is the English text; the UI translates `key` and then puts in the values, so the text
// has one entry in the dictionary for all values. The model does not import the i18n.

export type Values = Record<string, string | number>;

export class TextError extends Error {
  constructor(
    readonly key: string,
    readonly values: Values = {},
  ) {
    super(key.replace(/\{(\w+)\}/g, (all, name: string) => String(values[name] ?? all)));
  }
}
