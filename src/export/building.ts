// The exports of the whole building that a package contains: one PDF with a page for each story,
// one DXF with all stories, one SVG for each story, and the 3D model.

import type { Building } from "../model/types";
import { slug, storyExtras } from "./context";
import { buildingToDxf } from "./dxf";
import { buildingToPdf } from "./pdf";
import { planToSvg } from "./svg";

/**
 * The export files by name. The SVG of a story has the name of the story, for example
 * "ground-floor.svg". The 3D model is in the files only if `glb` is given, because only the
 * browser can make it.
 */
export function buildingExports(
  building: Building,
  glb?: Uint8Array,
): Record<string, Uint8Array | string> {
  const files: Record<string, Uint8Array | string> = {
    "plan.pdf": buildingToPdf(building),
    "plan.dxf": buildingToDxf(building),
  };
  for (const story of building.stories) {
    let name = `${slug(story.name)}.svg`;
    // Two stories with the same name get different files.
    for (let i = 2; name in files; i++) name = `${slug(story.name)}-${i}.svg`;
    files[name] = planToSvg(story, storyExtras(building, story));
  }
  if (glb) files["model.glb"] = glb;
  return files;
}
