// The energy for heating per year: a monthly balance in the spirit of EN ISO 13790. It is an
// estimate to compare variants, not an energy certificate. It ignores the hot water, the cooling,
// thermal bridges, and the details of the ground and the control.
//
// For each month m and each room:
//
//   loss      Q_l = H × (θ_room − θ_m) × t_m                 H: heat transfer coefficient in W/K
//   gains     Q_g = Q_solar + Q_internal
//   solar     Q_solar = Σ A_window × SOLAR_FACTOR × I_m(azimuth of the window)
//   internal  Q_internal = INTERNAL_GAINS × A_floor × t_m
//   demand    Q_h = max(0, Q_l − η × Q_g)
//
// θ_m is the mean temperature of the month and I_m the irradiation on a vertical face in the
// month, both from the stored climate. η is the utilization factor of the gains: a heavy
// building stores more of the sun and uses more of it. The final energy is the demand plus the
// losses of the distribution, divided by the efficiency of the heating.

import { climateFaceMonths, climateSeries, MONTH_DAYS, monthlyMeans } from "./climate";
import { buildingHeatLoss } from "./energy";
import { pvLayout, faceInfo } from "./pv";
import type { Building, HeatingKind, HeatingSystem } from "./types";

/** The internal gains of people and devices in a home, in W per m² of floor (ÖNORM B 8110-6). */
export const INTERNAL_GAINS = 3.75;
/**
 * The part of the sun on a window that heats the room: the g-value of the glass (0.5), the angle
 * of the sun (0.9), the frame (0.7), and the shade (0.85).
 */
export const SOLAR_FACTOR = 0.5 * 0.9 * 0.7 * 0.85;
/** The heat capacity of a building of medium weight, in Wh/(m²K) of floor (165 kJ/(m²K)). */
export const HEAT_CAPACITY = 45.8;
/** The losses of the pipes and the storage, as a part of the heat demand. */
export const DISTRIBUTION_LOSS = 0.1;

export interface HeatingKindInfo {
  name: string;
  /** The usual efficiency (or the seasonal performance factor of a heat pump). */
  efficiency: number;
  /** The usual price of the final energy in €/kWh, Austria 2025. */
  price: number;
  /** The CO₂ of the final energy in kg/kWh (conversion factors of OIB RL 6, 2019). */
  co2: number;
  /** The final energy: electricity, or a fuel. */
  energy: string;
}

export const HEATING_KINDS: Record<HeatingKind, HeatingKindInfo> = {
  "heat-pump": {
    name: "Heat pump",
    efficiency: 3.5,
    price: 0.25,
    co2: 0.227,
    energy: "electricity",
  },
  gas: { name: "Gas boiler", efficiency: 0.95, price: 0.11, co2: 0.247, energy: "gas" },
  oil: { name: "Oil boiler", efficiency: 0.9, price: 0.12, co2: 0.31, energy: "oil" },
  wood: { name: "Wood or pellets", efficiency: 0.85, price: 0.07, co2: 0.017, energy: "wood" },
  district: { name: "District heating", efficiency: 0.98, price: 0.12, co2: 0.11, energy: "heat" },
  electric: {
    name: "Direct electric",
    efficiency: 1,
    price: 0.25,
    co2: 0.227,
    energy: "electricity",
  },
};

/** A heating of the kind with the usual values. */
export function defaultHeating(kind: HeatingKind): HeatingSystem {
  const info = HEATING_KINDS[kind];
  return { kind, efficiency: info.efficiency, price: info.price };
}

/** The efficiency classes by the heat demand in kWh per m² and year (the scale of the OIB). */
export const EFFICIENCY_CLASSES: [string, number][] = [
  ["A++", 10],
  ["A+", 15],
  ["A", 25],
  ["B", 50],
  ["C", 100],
  ["D", 150],
  ["E", 200],
  ["F", 250],
  ["G", Infinity],
];

export const efficiencyClass = (perArea: number): string =>
  EFFICIENCY_CLASSES.find(([, limit]) => perArea <= limit)![0];

/**
 * The utilization factor of the gains (EN ISO 13790, 12.2.1.1): `ratio` is the gains divided by
 * the losses, and `tau` the time constant of the building in hours.
 */
export function utilization(ratio: number, tau: number): number {
  const a = 1 + tau / 15;
  if (ratio <= 0) return 1;
  if (Math.abs(ratio - 1) < 1e-9) return a / (a + 1);
  return (1 - ratio ** a) / (1 - ratio ** (a + 1));
}

export interface MonthEnergy {
  /** The heat loss, the gains, the used gains, and the heat demand, in kWh. */
  loss: number;
  solar: number;
  internal: number;
  used: number;
  demand: number;
  /** The final energy of the heating, and the PV yield of the month, in kWh. */
  final: number;
  pv: number;
}

export interface HeatingEnergy {
  months: MonthEnergy[];
  /** The heated floor area in m². */
  area: number;
  /** The heat demand per year in kWh, and per m². */
  demand: number;
  perArea: number;
  efficiencyClass: string;
  /** The final energy per year in kWh (electricity for a heat pump), its cost, and its CO₂ in kg. */
  final: number;
  cost: number;
  co2: number;
  /**
   * The final energy that the PV covers in the balance of each month, in kWh. Only electric
   * heating uses PV. The balance of the month is an upper limit: PV in the day does not heat
   * at night without a battery.
   */
  pvCovered: number;
}

/**
 * The energy for heating per year, or null if the building has no climate or no rooms. The
 * climate gives the monthly temperatures and the sun on the windows.
 */
export function heatingEnergy(building: Building): HeatingEnergy | null {
  const climate = building.climate;
  if (!climate) return null;
  const loss = buildingHeatLoss(building);
  if (loss.rooms.length === 0 || loss.area <= 0) return null;
  const temperatures = monthlyMeans(climateSeries(climate).temperature);
  const heating = building.envelope.heating;
  const info = HEATING_KINDS[heating.kind];
  const pvMonths = pvMonthly(building);

  // The whole building is one zone for the utilization: its time constant comes from all rooms.
  const transfer = loss.rooms.reduce((sum, r) => sum + r.transfer, 0);
  const tau = transfer > 0 ? (HEAT_CAPACITY * loss.area) / transfer : 0;
  // The sun on the windows of each direction, in kWh per m² of glass and month.
  const sun = new Map<number, number[]>();
  const sunOn = (azimuth: number) => {
    const key = Math.round(azimuth);
    let months = sun.get(key);
    if (!months) {
      months = climateFaceMonths(climate, 90, key);
      sun.set(key, months);
    }
    return months;
  };

  const months: MonthEnergy[] = MONTH_DAYS.map((days, m) => {
    const hours = days * 24;
    let monthLoss = 0;
    let solar = 0;
    for (const room of loss.rooms) {
      monthLoss += (room.transfer * Math.max(0, room.temperature - temperatures[m]) * hours) / 1000;
      for (const glass of room.glazing)
        solar += glass.area * SOLAR_FACTOR * sunOn(glass.azimuth)[m];
    }
    const internal = (INTERNAL_GAINS * loss.area * hours) / 1000;
    const gains = solar + internal;
    const used = monthLoss > 0 ? Math.min(gains, utilization(gains / monthLoss, tau) * gains) : 0;
    const demand = Math.max(0, monthLoss - used);
    const final = (demand * (1 + DISTRIBUTION_LOSS)) / heating.efficiency;
    return { loss: monthLoss, solar, internal, used, demand, final, pv: pvMonths[m] };
  });

  const demand = months.reduce((sum, m) => sum + m.demand, 0);
  const final = months.reduce((sum, m) => sum + m.final, 0);
  const electric = info.energy === "electricity";
  const pvCovered = electric ? months.reduce((sum, m) => sum + Math.min(m.final, m.pv), 0) : 0;
  const perArea = demand / loss.area;
  return {
    months,
    area: loss.area,
    demand,
    perArea,
    efficiencyClass: efficiencyClass(perArea),
    final,
    cost: final * heating.price,
    co2: final * info.co2,
    pvCovered,
  };
}

/**
 * The PV yield of the building in each month, in kWh: the yearly yield of each field, split by
 * the sun on its face in each month.
 */
function pvMonthly(building: Building): number[] {
  const result = new Array<number>(12).fill(0);
  const climate = building.climate;
  if (!climate) return result;
  const faces = faceInfo(building);
  for (const array of building.pv) {
    const layout = pvLayout(building, array);
    const face = faces.find((f) => f.roofId === array.roofId && f.index === array.face);
    if (!layout || !face) continue;
    const months = climateFaceMonths(climate, face.tilt, face.azimuth);
    const total = months.reduce((sum, v) => sum + v, 0);
    if (total <= 0) continue;
    months.forEach((v, m) => (result[m] += (layout.yield * v) / total));
  }
  return result;
}
