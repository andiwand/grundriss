// The German dictionary: the parts of the dictionary, one for each group of modules. The key is
// the English text of the code, and the value is the German text with the same placeholders.

import { APP } from "./app";
import { ENERGY } from "./energy";
import { MODEL } from "./model";
import { PANELS } from "./panels";
import { PROJECTS } from "./projects";

export const DE: Record<string, string> = {
  ...MODEL,
  ...APP,
  ...PANELS,
  ...ENERGY,
  ...PROJECTS,
};
