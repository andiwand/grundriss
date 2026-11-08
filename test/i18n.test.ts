import { describe, expect, it } from "vitest";
import { APP } from "../src/i18n/de/app";
import { ENERGY } from "../src/i18n/de/energy";
import { MODEL } from "../src/i18n/de/model";
import { PANELS } from "../src/i18n/de/panels";
import { PROJECTS } from "../src/i18n/de/projects";

const PARTS: Record<string, Record<string, string>> = { MODEL, APP, PANELS, ENERGY, PROJECTS };
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("German dictionary", () => {
  it("gives a key the same German text in each part", () => {
    const seen = new Map<string, string>();
    const conflicts: string[] = [];
    for (const [part, dictionary] of Object.entries(PARTS)) {
      for (const [key, value] of Object.entries(dictionary)) {
        const before = seen.get(key);
        if (before !== undefined && before !== value) conflicts.push(`${part}: ${key}`);
        seen.set(key, value);
      }
    }
    expect(conflicts).toEqual([]);
  });

  it("keeps the placeholders of each key", () => {
    const wrong: string[] = [];
    for (const dictionary of Object.values(PARTS)) {
      for (const [key, value] of Object.entries(dictionary)) {
        if (placeholders(key).join() !== placeholders(value).join()) wrong.push(key);
      }
    }
    expect(wrong).toEqual([]);
  });
});
