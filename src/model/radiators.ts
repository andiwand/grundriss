// The heat pump readiness of the rooms: the flow temperature that the radiators and the floor
// heating of each room need for its heat loss at the design temperature.
//
// The power of a radiator (`Fixture.power`) is its power at 75/65/20 °C (EN 442): flow, return,
// and room. At other temperatures, the power changes with the mean difference of temperature
// between the water and the room, with the exponent RADIATOR_EXPONENT:
//
//   P = P₇₅ × (ΔT / ΔT₇₅)^n,   ΔT = (θ_flow − θ_return) / ln((θ_flow − θ_room) / (θ_return − θ_room))
//
// A heat pump works with a small spread between the flow and the return (SPREAD). Floor heating
// gives FLOOR_HEATING_POWER per m² at FLOOR_FLOW, and its power changes linearly with the mean
// difference of temperature. A room needs the lowest flow temperature in steps of 1 K that
// gives its heat loss. A heat pump works well up to 45 °C, and acceptably up to 55 °C.

import { buildingHeatLoss, FLOOR_HEATING_POWER, type BuildingLoss } from "./energy";
import type { Building, Id } from "./types";

/** The exponent of the power of a radiator. */
export const RADIATOR_EXPONENT = 1.3;
/** The mean difference of temperature of a radiator at 75/65/20 °C, in K (logarithmic). */
export const NOMINAL_DELTA = 10 / Math.log(55 / 45);
/** The spread between the flow and the return of a heat pump, in K. */
export const SPREAD = 5;
/** The flow temperature at which floor heating gives FLOOR_HEATING_POWER, in °C. */
export const FLOOR_FLOW = 35;
/** The range of the flow temperatures that the readiness tries, in °C. */
export const LOWEST_FLOW = 28;
export const HIGHEST_FLOW = 75;
/** A heat pump works well up to this flow temperature, and acceptably up to the next, in °C. */
export const GOOD_FLOW = 45;
export const FAIR_FLOW = 55;

/** The mean difference of temperature between the water and the room, in K (logarithmic). */
function meanDelta(flow: number, room: number, spread = SPREAD): number {
  const ret = flow - spread;
  if (ret <= room + 0.1) return Math.max(0, (flow + ret) / 2 - room);
  return spread / Math.log((flow - room) / (ret - room));
}

/** The power of a radiator with the power `nominal` at 75/65/20 °C, at the flow temperature. */
export function radiatorPower(nominal: number, flow: number, room: number): number {
  const delta = meanDelta(flow, room);
  return delta > 0 ? nominal * (delta / NOMINAL_DELTA) ** RADIATOR_EXPONENT : 0;
}

/** The power of floor heating with the area at the flow temperature, in W. */
export function floorHeatingPower(area: number, flow: number, room: number): number {
  const delta = meanDelta(flow, room);
  const nominal = meanDelta(FLOOR_FLOW, room);
  return nominal > 0 ? (FLOOR_HEATING_POWER * area * delta) / nominal : 0;
}

export type Readiness = "good" | "fair" | "poor" | "none";

export interface RoomReadiness {
  storyId: Id;
  key: string;
  name: string;
  /** The heat loss of the room at the design temperature, in W. */
  loss: number;
  /** The power of the radiators at 75/65/20 °C, in W, and the area of the floor heating in m². */
  radiators: number;
  floorArea: number;
  /** The power of the heating at a flow of 35, 45, and 55 °C, in W. */
  at35: number;
  at45: number;
  at55: number;
  /** The lowest flow temperature that gives the heat loss, or null if no flow up to 75 °C does. */
  flow: number | null;
  /** good: up to 45 °C. fair: up to 55 °C. poor: more, or not enough. none: no heating. */
  readiness: Readiness;
}

/** The verdict for a flow temperature. */
export function readinessOf(flow: number | null, heated: boolean): Readiness {
  if (!heated) return "none";
  if (flow === null) return "poor";
  return flow <= GOOD_FLOW ? "good" : flow <= FAIR_FLOW ? "fair" : "poor";
}

/** The heat pump readiness of each heated room. `loss` saves a calculation if the caller has it. */
export function roomReadiness(
  building: Building,
  loss: BuildingLoss = buildingHeatLoss(building),
): RoomReadiness[] {
  const result: RoomReadiness[] = [];
  for (const room of loss.rooms) {
    // The heat loss has the power of the radiators in the room, and its floor heating.
    const radiators = room.heating;
    const floorArea = room.floorHeating ? room.area : 0;
    const powerAt = (flow: number) =>
      radiatorPower(radiators, flow, room.temperature) +
      floorHeatingPower(floorArea, flow, room.temperature);
    let flow: number | null = null;
    if (radiators > 0 || floorArea > 0) {
      for (let t = LOWEST_FLOW; t <= HIGHEST_FLOW; t++) {
        if (powerAt(t) >= room.total) {
          flow = t;
          break;
        }
      }
    }
    result.push({
      storyId: room.storyId,
      key: room.key,
      name: room.name,
      loss: room.total,
      radiators,
      floorArea,
      at35: powerAt(35),
      at45: powerAt(45),
      at55: powerAt(55),
      flow,
      readiness: readinessOf(flow, radiators > 0 || floorArea > 0),
    });
  }
  return result;
}

/**
 * The flow temperature that the heating of the building needs at the design temperature: the
 * highest flow of the rooms with a heating. Null if no room has a heating.
 */
export function designFlow(rooms: RoomReadiness[]): number | null {
  const flows = rooms.filter((r) => r.readiness !== "none").map((r) => r.flow ?? HIGHEST_FLOW);
  return flows.length > 0 ? Math.max(...flows) : null;
}
