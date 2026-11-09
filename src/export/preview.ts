// The small picture of a plan for the cards of the home page. The app and the server use it, so
// it must not import from the DOM.

import type { Building } from "../model/types";
import { storyExtras } from "./context";
import { planToSvg } from "./svg";

/** A small SVG of the ground floor, without the background image, or "" without walls. */
export function planPreview(building: Building): string {
  const story = building.stories.find((s) => s.elevation >= -1e-6) ?? building.stories[0];
  if (!story || story.walls.length === 0) return "";
  try {
    return planToSvg(story, { ...storyExtras(building, story), background: false });
  } catch {
    return "";
  }
}
