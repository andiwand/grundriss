// The quantities of the building services: the lengths of the cables and the pipes, and the
// number of the devices. A line runs on the plan at its height. Where it connects to a device,
// it also goes up or down to the height of the device.

import { FIXTURE_TYPES, RUN_KINDS, runLength } from "./services";
import type { Building, Plan, Run } from "./types";

export interface RunQuantity {
  kind: string;
  name: string;
  /** The length in meters. */
  length: number;
}

export interface FixtureQuantity {
  type: string;
  name: string;
  count: number;
}

// An unknown kind or type keeps its own id as the name, so that the list does not mislabel it.
const kindName = (kind: string) => RUN_KINDS.find((k) => k.kind === kind)?.name ?? kind;
const typeName = (type: string) => FIXTURE_TYPES.find((t) => t.type === type)?.name ?? type;

/** The length of a line with the vertical parts to the devices at its ends. */
export function runTotalLength(plan: Plan, run: Run): number {
  let length = runLength(run);
  for (const id of [run.from, run.to]) {
    const fixture = id ? plan.fixtures.find((f) => f.id === id) : undefined;
    if (fixture) length += Math.abs(run.elevation - fixture.elevation);
  }
  return length;
}

/** The lengths per kind of line, in the order of RUN_KINDS. Kinds without a line do not show. */
export function runQuantities(plans: Plan[]): RunQuantity[] {
  const lengths = new Map<string, number>();
  for (const plan of plans) {
    for (const run of plan.runs) {
      lengths.set(run.kind, (lengths.get(run.kind) ?? 0) + runTotalLength(plan, run));
    }
  }
  const known = RUN_KINDS.map((k) => k.kind);
  const kinds = [...known, ...[...lengths.keys()].filter((k) => !known.includes(k))];
  return kinds
    .filter((kind) => lengths.has(kind))
    .map((kind) => ({ kind, name: kindName(kind), length: lengths.get(kind)! }));
}

/** The number of devices per type, in the order of FIXTURE_TYPES. */
export function fixtureQuantities(plans: Plan[]): FixtureQuantity[] {
  const counts = new Map<string, number>();
  for (const plan of plans) {
    for (const fixture of plan.fixtures) {
      counts.set(fixture.type, (counts.get(fixture.type) ?? 0) + 1);
    }
  }
  const known = FIXTURE_TYPES.map((t) => t.type);
  const types = [...known, ...[...counts.keys()].filter((t) => !known.includes(t))];
  return types
    .filter((type) => counts.has(type))
    .map((type) => ({ type, name: typeName(type), count: counts.get(type)! }));
}

/** The quantities of one story. */
export const storyQuantities = (plan: Plan) => ({
  runs: runQuantities([plan]),
  fixtures: fixtureQuantities([plan]),
});

/** The quantities of all stories of the building. */
export const buildingQuantities = (building: Building) => ({
  runs: runQuantities(building.stories),
  fixtures: fixtureQuantities(building.stories),
});
