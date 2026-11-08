// The summer overheating of the rooms: an hourly estimate in the spirit of ÖNORM B 8110-3 and
// DIN 4108-2. It is not the procedure of these standards. Use it to find the rooms with a risk
// and to compare measures (shading, less glass, night ventilation), not for a permit.
//
// Each heated room is one thermal node (a 1R1C model). The air and the mass of the room have one
// temperature θ. For each hour:
//
//   capacity      C = HEAT_CAPACITY × A_floor                        in Wh/K
//   loss          H = H_transmission + AIR_HEAT × n × V               in W/K
//   gains         Φ = Σ A_window × SOLAR_FACTOR × F_shade × I(azimuth) + INTERNAL_GAINS × A_floor
//   balance       θ_eq = θ_outside + Φ / H
//   next hour     θ ← θ_eq + (θ − θ_eq) × exp(−1 h × H / C)
//
// H_transmission is the `transfer` of the room (energy.ts) without its ventilation part. I is the
// irradiance on the face of the window in the hour, with its tilt and azimuth, from the stored
// climate. The air change n follows the user: open windows in the day and more at night if the
// outside is cooler. If the outside is warmer than the room, the windows close, and the air
// change of the envelope applies (`effectiveAirChange` of energy.ts).
//
// The simulation starts at START_TEMPERATURE some days before the summer, so the start value has
// no effect on the result. It counts the hours from 1 June to 31 August.
//
// The limits: one node puts all the mass in direct contact with the air, so the peaks are lower
// than in a real room. The model ignores the heat flow between rooms, the shade of the eaves and
// of the neighbors, and the operative temperature (the mean of the air and the surfaces).

import {
  climateSeries,
  climateSun,
  faceIrradiance,
  HOURS,
  localHour,
  MONTH_HOURS,
} from "./climate";
import type { ClimateSeries } from "./climate";
import { AIR_HEAT, buildingHeatLoss, effectiveAirChange } from "./energy";
import { HEAT_CAPACITY, INTERNAL_GAINS, SOLAR_FACTOR } from "./heating";
import type { Building, Climate, Id } from "./types";

/** The first and the last month of the summer that the result counts (0 is January). */
export const SUMMER_FIRST_MONTH = 5;
export const SUMMER_LAST_MONTH = 7;
/** The simulation starts this many days before the summer, so that the start value fades. */
export const WARM_UP_DAYS = 14;
/** The temperature of the rooms at the start of the simulation, in °C. */
export const START_TEMPERATURE = 22;
/** The air change per hour in the day, with the windows open or tilted. */
export const DAY_AIR_CHANGE = 1.5;
/** The air change per hour at night, with the windows open for night ventilation. */
export const NIGHT_AIR_CHANGE = 3;
/** The night is from NIGHT_START to NIGHT_END in the local solar time, in hours. */
export const NIGHT_START = 22;
export const NIGHT_END = 6;
/**
 * The part of the sun that goes through external blinds (the factor F_C of DIN 4108-2 for
 * external venetian blinds). The blinds close if the sun on the window is more than
 * BLINDS_THRESHOLD.
 */
export const BLINDS_FACTOR = 0.25;
export const BLINDS_THRESHOLD = 200;
/** The limits of the temperature for the counts of the hours, in °C. */
export const LIMIT_HIGH = 27;
export const LIMIT_LOW = 25;
/**
 * The limits of the verdict, in K·h over LIMIT_HIGH in the summer. DIN 4108-2 permits 1200 K·h
 * per year over the limit for homes. Below WARNING_DEGREE_HOURS, the room is ok. Above
 * RISK_DEGREE_HOURS, the room has a risk of overheating. Between them, it is a warning.
 */
export const WARNING_DEGREE_HOURS = 500;
export const RISK_DEGREE_HOURS = 1200;

export type OverheatingVerdict = "ok" | "warning" | "risk";

export interface RoomOverheating {
  storyId: Id;
  key: string;
  name: string;
  /** The hours of the summer over LIMIT_HIGH (27 °C) and over LIMIT_LOW (25 °C). */
  hoursOver27: number;
  hoursOver25: number;
  /** The K·h over LIMIT_HIGH in the summer: the sum of the excess of each hour. */
  degreeHours: number;
  /** The highest temperature of the room in the summer, in °C. */
  max: number;
  /** The area of the windows divided by the floor area. */
  glazingRatio: number;
  verdict: OverheatingVerdict;
}

export interface OverheatingOptions {
  /** True if all windows have external blinds (BLINDS_FACTOR). */
  blinds?: boolean;
}

/** The verdict for the K·h over LIMIT_HIGH. */
export function overheatingVerdict(degreeHours: number): OverheatingVerdict {
  if (degreeHours < WARNING_DEGREE_HOURS) return "ok";
  return degreeHours < RISK_DEGREE_HOURS ? "warning" : "risk";
}

/** The first hour of a month in the typical year. */

/** The data of the summer of one climate: the sun path and the sun on each direction. */
interface Summer {
  sun: Float64Array;
  /** The irradiance on a face in each hour of the simulation, by rounded tilt and azimuth. */
  faces: Map<string, Float32Array>;
}

/** climate.ts keeps the decoded series in a cache, so the same climate gives the same object. */
const summers = new WeakMap<ClimateSeries, Summer>();

/** The first hour and the end of the simulation, and the first hour that the result counts. */
const COUNT_FROM = MONTH_HOURS[SUMMER_FIRST_MONTH];
const FIRST = Math.max(0, COUNT_FROM - WARM_UP_DAYS * 24);
const END = Math.min(HOURS, MONTH_HOURS[SUMMER_LAST_MONTH + 1]);

/** The summer of the climate. The sun path comes from the cache of climate.ts. */
function summerOf(climate: Climate, series: ClimateSeries): Summer {
  let summer = summers.get(series);
  if (!summer) {
    summer = { sun: climateSun(climate), faces: new Map() };
    summers.set(series, summer);
  }
  return summer;
}

/** The irradiance on a face of the tilt and the azimuth in each hour of the simulation, in W/m². */
function faceSummer(
  series: ClimateSeries,
  summer: Summer,
  azimuth: number,
  tilt = 90,
): Float32Array {
  const direction = ((Math.round(azimuth) % 360) + 360) % 360;
  const slope = Math.round(tilt);
  const key = `${slope}:${direction}`;
  let values = summer.faces.get(key);
  if (!values) {
    values = new Float32Array(END - FIRST);
    for (let h = FIRST; h < END; h++) {
      const part = faceIrradiance(series, summer.sun, h, slope, direction);
      values[h - FIRST] = part.beam + part.diffuse + part.ground;
    }
    summer.faces.set(key, values);
  }
  return values;
}

/**
 * The summer overheating of each room of the heated stories, or null if the building has no
 * climate. A room without a floor area has no result.
 */
export function summerOverheating(
  building: Building,
  options: OverheatingOptions = {},
): RoomOverheating[] | null {
  const climate = building.climate;
  if (!climate) return null;
  const series = climateSeries(climate);
  const summer = summerOf(climate, series);
  const temperature = series.temperature;
  // With closed windows, the air change of the envelope: the windows, the leaks, and a system.
  const closed = effectiveAirChange(building.envelope);
  const isNight = (h: number) => {
    const local = localHour(h, climate.longitude);
    return local >= NIGHT_START || local < NIGHT_END;
  };

  const result: RoomOverheating[] = [];
  for (const room of buildingHeatLoss(building).rooms) {
    if (room.area <= 0) continue;
    const capacity = HEAT_CAPACITY * room.area;
    const transmission = Math.max(0, room.transfer - room.ventilationTransfer);
    const internal = INTERNAL_GAINS * room.area;
    const glassArea = room.glazing.reduce((sum, g) => sum + g.area, 0);
    const windows = room.glazing.map((g) => ({
      area: g.area * SOLAR_FACTOR,
      sun: faceSummer(series, summer, g.azimuth, g.tilt),
    }));

    let theta = START_TEMPERATURE;
    let max = -Infinity;
    let hoursOver27 = 0;
    let hoursOver25 = 0;
    let degreeHours = 0;
    for (let h = FIRST; h < END; h++) {
      const outside = temperature[h];
      // The user opens the windows only if the outside is cooler than the room.
      const change = outside < theta ? (isNight(h) ? NIGHT_AIR_CHANGE : DAY_AIR_CHANGE) : closed;
      const loss = transmission + AIR_HEAT * change * room.volume;
      let gains = internal;
      for (const window of windows) {
        const sun = window.sun[h - FIRST];
        const shade = options.blinds && sun > BLINDS_THRESHOLD ? BLINDS_FACTOR : 1;
        gains += window.area * shade * sun;
      }
      // The exact solution of C dθ/dt = Φ − H (θ − θ_outside) over one hour.
      if (loss > 0) {
        const balance = outside + gains / loss;
        theta = balance + (theta - balance) * Math.exp(-loss / capacity);
      } else theta += gains / capacity;
      if (h < COUNT_FROM) continue;
      max = Math.max(max, theta);
      if (theta > LIMIT_HIGH) {
        hoursOver27++;
        degreeHours += theta - LIMIT_HIGH;
      }
      if (theta > LIMIT_LOW) hoursOver25++;
    }
    result.push({
      storyId: room.storyId,
      key: room.key,
      name: room.name,
      hoursOver27,
      hoursOver25,
      degreeHours,
      max,
      glazingRatio: glassArea / room.area,
      verdict: overheatingVerdict(degreeHours),
    });
  }
  return result;
}
