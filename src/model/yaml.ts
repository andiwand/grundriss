// The text of the files: YAML, because a person can read it. The app also reads the JSON of
// older files. YAML 1.2 contains JSON, but JSON.parse is much faster for a large file, so a text
// that starts with "{" goes to JSON.parse first.

import { Document, isCollection, isPair, isScalar, isSeq, parse, visit, type Node } from "yaml";

/** A collection of other short values on one line gets at most this many items. */
const FLOW_ITEMS = 6;
/** A value in a collection on one line has at most this many characters. */
const FLOW_TEXT = 40;

/** True if all items of a collection are short scalars, so that the collection fits on a line. */
function isFlat(node: Node): boolean {
  if (!isCollection(node) || node.items.length === 0) return false;
  // A list of numbers, for example the hours of a climate, goes on one line at each length.
  if (isSeq(node) && node.items.every((item) => isScalar(item) && typeof item.value === "number"))
    return true;
  if (node.items.length > FLOW_ITEMS) return false;
  const short = (value: unknown) =>
    value === null ||
    (isScalar(value) && (typeof value.value !== "string" || value.value.length <= FLOW_TEXT));
  return node.items.every((item) =>
    isPair(item) ? short(item.key) && short(item.value) : short(item),
  );
}

/**
 * The YAML of a value of JSON. A small collection of short values goes on one line, for
 * example `{ id: v-1, x: 0, y: 4 }`, so that a long list stays short. A long text, for example a
 * data URL, stays on one line.
 */
export function toYaml(value: unknown): string {
  const doc = new Document(value, { aliasDuplicateObjects: false });
  visit(doc, {
    Map: (_key, node) => {
      if (isFlat(node)) node.flow = true;
    },
    Seq: (_key, node) => {
      if (isFlat(node)) node.flow = true;
    },
  });
  // The top level of a file stays in lines, also if it is small.
  if (isCollection(doc.contents)) doc.contents.flow = false;
  return doc.toString({ lineWidth: 0, minContentWidth: 0 });
}

/** Reads the text of a file in YAML or in JSON. It throws if the text is neither. */
export function parseText(text: string): unknown {
  if (/^\s*[{[]/.test(text)) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      // A YAML flow collection can also start with "{".
    }
  }
  return parse(text) as unknown;
}

/** True if the name of a file has the extension of YAML. */
export const isYamlName = (name: string): boolean => /\.ya?ml$/i.test(name);

/** True if the name of a file has the extension of JSON. */
export const isJsonName = (name: string): boolean => /\.json$/i.test(name);
