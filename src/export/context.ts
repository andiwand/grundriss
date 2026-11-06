// The data from the building that the export of one story needs: the rise of each stair, the
// chimneys from the stories below that pass through, and the north direction.

import { chimneysThrough, stairRise, STORY_DEFAULTS } from "../model/building";
import type { Building, Chimney, Id, Plan, Stair, Story } from "../model/types";

export interface StoryExtras {
  /** The rise of each stair by its id. A stair without an entry rises one story height. */
  rises?: Record<Id, number>;
  /** The chimneys of the stories below that go up through this story. */
  through?: Chimney[];
  /** The direction of north in degrees. Without it, the export draws no north arrow. */
  north?: number;
}

export function storyExtras(building: Building, story: Story): StoryExtras {
  const rises: Record<Id, number> = {};
  const rise = stairRise(building, story);
  for (const stair of story.stairs) rises[stair.id] = rise;
  return {
    rises,
    through: chimneysThrough(building, story).map((entry) => entry.chimney),
    north: building.north,
  };
}

/** The rise of the stair: from the extras, or else the height of the story. */
export function riseOf(plan: Plan, stair: Stair, extras: StoryExtras): number {
  const height = (plan as Partial<Story>).height ?? STORY_DEFAULTS.height;
  return extras.rises?.[stair.id] ?? height;
}

/** True if the story has nothing to draw. */
export function isEmptyStory(story: Plan, extras: StoryExtras = {}): boolean {
  return (
    story.walls.length === 0 &&
    story.vertices.length === 0 &&
    story.dimensions.length === 0 &&
    story.stairs.length === 0 &&
    story.chimneys.length === 0 &&
    (extras.through?.length ?? 0) === 0
  );
}

/** A name for files: lower case, with "-" between the words. */
export function slug(name: string): string {
  const text = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text || "story";
}
