// The energy for heating and hot water per year: a monthly balance in the spirit of EN ISO 13790.
// It is an estimate to compare variants, not an energy certificate. It ignores the cooling and
// the details of the ground and the control.
//
// For each month m and each room:
//
//   loss      Q_l = H × (θ_room − θ_m) × t_m                 H: heat transfer coefficient in W/K
//   gains     Q_g = Q_solar + Q_internal
//   solar     Q_solar = Σ A_window × SOLAR_FACTOR × I_m(tilt and azimuth of the window)
//   internal  Q_internal = INTERNAL_GAINS × A_floor × t_m
//   demand    Q_h = max(0, Q_l − η × Q_g)
//
// θ_m is the mean temperature of the month and I_m the irradiation on the face of the window in
// the month, both from the stored climate. η is the utilization factor of the gains: a heavy
// building stores more of the sun and uses more of it. The final energy is the demand plus the
// losses of the distribution, divided by the efficiency of the heating.
//
// The hot water is the same on each day: people × liters × 1.163 Wh/(l·K) × 45 K. The storage
// and the pipes lose HOT_WATER_LOSS more. The heating makes it with its efficiency, but a heat
// pump has a lower performance factor for the higher temperature. A direct electric heater has
// an efficiency of 1. The hot water does not change the heat demand and the class.
//
// The heat of each month goes to its hours by the degree hours: the inside temperature minus the
// temperature of the hour. The hot water goes to the hours from 6:00 to 22:00. A heat pump
// without a fixed performance factor has its own performance in each hour (`pumpCop`): a part
// PUMP_QUALITY of the Carnot performance between the flow and the source. The flow follows a
// heating curve from the design flow at the design temperature down to the room temperature. The
// design flow is the flow of the heating, or the flow that the radiators need (`radiators.ts`).
//
// The energy per m² uses the gross floor area of the heated stories (BGF), like the OIB. The
// class is still an estimate: the OIB uses a reference climate, and this model the climate of the
// location.

import {
  climateFaceMonths,
  climateSeries,
  HOURS,
  localHour,
  MONTH_DAYS,
  MONTH_HOURS,
  monthlyMeans,
} from "./climate";
import { buildingHeatLoss } from "./energy";
import { designFlow, RADIATOR_EXPONENT, roomReadiness } from "./radiators";
import { pvHourly } from "./pv";
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
/** The heat to warm one liter of water by 45 K (from 10 °C to 55 °C), in kWh. */
export const HOT_WATER_HEAT = (1.163 * 45) / 1000;
/** The losses of the storage and the circulation of the hot water, as a part of its heat. */
export const HOT_WATER_LOSS = 0.4;
/** A heat pump makes hot water with this part of its performance factor for the heating. */
export const HOT_WATER_PUMP = 0.8;
/** The real performance of a heat pump as a part of the Carnot performance. */
export const PUMP_QUALITY = { air: 0.4, ground: 0.45 } as const;
/** The temperature of the brine of a ground source heat pump, in °C. */
export const GROUND_SOURCE = 5;
/** The differences of temperature at the condenser and at the evaporator, in K. */
const CONDENSER = 3;
const EVAPORATOR = 5;
/** The flow temperature of the hot water, and the flow without radiators, in °C. */
export const HOT_WATER_FLOW = 55;
export const DEFAULT_FLOW = 45;
/** The lowest flow temperature of the heating curve, in °C. */
const LOWEST_CURVE_FLOW = 25;

/** The performance of a heat pump at a flow temperature and an outside temperature. */
export function pumpCop(source: "air" | "ground", flow: number, outside: number): number {
  const sink = flow + CONDENSER + 273.15;
  const from = (source === "ground" ? GROUND_SOURCE : outside) - EVAPORATOR + 273.15;
  const carnot = sink / Math.max(5, sink - from);
  return Math.min(7, Math.max(1, PUMP_QUALITY[source] * carnot));
}

/**
 * The flow temperature at an outside temperature: a heating curve from the design flow at the
 * design temperature to the room temperature, with the exponent of the radiators. Floor heating
 * has an exponent of about 1.1, so its curve is a little flatter; the model ignores that.
 */
export function curveFlow(design: number, outside: number, inside: number, designOutside: number) {
  const share = Math.min(1, Math.max(0, (inside - outside) / Math.max(1, inside - designOutside)));
  return Math.max(LOWEST_CURVE_FLOW, inside + (design - inside) * share ** (1 / RADIATOR_EXPONENT));
}

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

/** A heating of the kind with the usual values. A heat pump calculates its performance. */
export function defaultHeating(kind: HeatingKind): HeatingSystem {
  const info = HEATING_KINDS[kind];
  return {
    kind,
    efficiency: info.efficiency,
    price: info.price,
    source: "air",
    flow: null,
    fixedEfficiency: false,
  };
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
  // Divide by ratio^a for large gains, so that the powers cannot overflow.
  if (ratio > 1) return (1 - ratio ** -a) / (ratio - ratio ** -a);
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
  /** The heat for the hot water with its losses, and its final energy, in kWh. */
  hotWater: number;
  hotWaterFinal: number;
}

export interface HeatingEnergy {
  months: MonthEnergy[];
  /** The gross floor area of the heated stories (BGF) in m². */
  area: number;
  /** The heat demand per year in kWh, and per m². */
  demand: number;
  perArea: number;
  efficiencyClass: string;
  /** The final energy of the heating per year in kWh (electricity for a heat pump). */
  final: number;
  /** The heat for the hot water per year with its losses, and its final energy, in kWh. */
  hotWater: number;
  hotWaterFinal: number;
  /** True if the hot water uses electricity. */
  hotWaterElectric: boolean;
  /** The cost and the CO₂ in kg of the heating and the hot water together. */
  cost: number;
  co2: number;
  /** The final energy that uses electricity: the parts of the heating and the hot water. */
  electric: number;
  /** The final energy of the heating and of the hot water in each hour of the year, in kWh. */
  hourlyHeating: Float64Array;
  hourlyHotWater: Float64Array;
  /**
   * For a heat pump: the seasonal performance factor (heat for the heating and the hot water
   * divided by the electricity), the design flow, and where the flow comes from.
   */
  spf: number | null;
  flow: number | null;
  flowSource: "set" | "radiators" | "default" | null;
  /**
   * The electricity that the PV covers in the balance of each month, in kWh. The balance of the
   * month is an upper limit: PV in the day does not heat at night without a battery.
   */
  pvCovered: number;
}

/**
 * The price of the final energy of the heating per kWh. A heating with electricity uses the price
 * of electricity of the household; the other kinds use their own price.
 */
export function heatingPrice(building: Building): number {
  const heating = building.envelope.heating;
  return HEATING_KINDS[heating.kind].energy === "electricity"
    ? building.household.price
    : heating.price;
}

/**
 * The hot water of one day: the heat with its losses, the final energy, its price per kWh, its
 * CO₂ per kWh, and true if it uses electricity.
 */
export function hotWaterDay(building: Building) {
  const { hotWater, heating } = building.envelope;
  const heat = hotWater.people * hotWater.liters * HOT_WATER_HEAT * (1 + HOT_WATER_LOSS);
  const own = HEATING_KINDS[heating.kind];
  if (hotWater.heater === "electric") {
    const co2 = HEATING_KINDS.electric.co2;
    return { heat, final: heat, price: building.household.price, co2, electric: true };
  }
  const pump = heating.kind === "heat-pump";
  const efficiency = heating.efficiency * (pump ? HOT_WATER_PUMP : 1);
  const final = heat / efficiency;
  const price = heatingPrice(building);
  return { heat, final, price, co2: own.co2, electric: own.energy === "electricity" };
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
  const series = climateSeries(climate);
  const temperatures = monthlyMeans(series.temperature);
  const heating = building.envelope.heating;
  const info = HEATING_KINDS[heating.kind];
  const pvMonths = pvMonthly(building);
  const water = hotWaterDay(building);
  const area = loss.grossArea > 0 ? loss.grossArea : loss.area;
  // A heat pump with a calculated performance needs the design flow.
  const pump = heating.kind === "heat-pump";
  const auto = pump && !heating.fixedEfficiency;
  let flow: number | null = null;
  let flowSource: HeatingEnergy["flowSource"] = null;
  if (pump) {
    const needed = designFlow(roomReadiness(building, loss));
    flow = heating.flow ?? needed ?? DEFAULT_FLOW;
    flowSource = heating.flow !== null ? "set" : needed !== null ? "radiators" : "default";
  }

  // The whole building is one zone for the utilization: its time constant comes from all rooms.
  const transfer = loss.rooms.reduce((sum, r) => sum + r.transfer, 0);
  const tau = transfer > 0 ? (HEAT_CAPACITY * area) / transfer : 0;
  // The sun on a window in kWh per m² of glass and month. Whole degrees let the cache of
  // climate.ts serve the windows with almost the same direction.
  const sunOn = (azimuth: number, tilt: number) =>
    climateFaceMonths(climate, Math.round(tilt), Math.round(azimuth));

  const months: MonthEnergy[] = MONTH_DAYS.map((days, m) => {
    const hours = days * 24;
    let monthLoss = 0;
    let solar = 0;
    for (const room of loss.rooms) {
      monthLoss += (room.transfer * Math.max(0, room.temperature - temperatures[m]) * hours) / 1000;
      for (const glass of room.glazing)
        solar += glass.area * SOLAR_FACTOR * sunOn(glass.azimuth, glass.tilt)[m];
    }
    const internal = (INTERNAL_GAINS * area * hours) / 1000;
    const gains = solar + internal;
    const used = monthLoss > 0 ? Math.min(gains, utilization(gains / monthLoss, tau) * gains) : 0;
    const demand = Math.max(0, monthLoss - used);
    // The hours below give the final energy of the heating and of the hot water.
    return {
      loss: monthLoss,
      solar,
      internal,
      used,
      demand,
      final: 0,
      pv: pvMonths[m],
      hotWater: water.heat * days,
      hotWaterFinal: 0,
    };
  });

  // The hours: the heat of each month by the degree hours, and the hot water from 6 to 22.
  const hourlyHeating = new Float64Array(HOURS);
  const hourlyHotWater = new Float64Array(HOURS);
  const inside = building.envelope.inside;
  let start = 0;
  let pumpHeat = 0;
  months.forEach((month, m) => {
    const end = start + MONTH_DAYS[m] * 24;
    const heat = month.demand * (1 + DISTRIBUTION_LOSS);
    let degrees = 0;
    for (let h = start; h < end; h++) degrees += Math.max(0, inside - series.temperature[h]);
    let final = 0;
    let waterFinal = 0;
    const waterHour = water.heat / 16;
    for (let h = start; h < end; h++) {
      const outside = series.temperature[h];
      const part =
        degrees > 0 ? (heat * Math.max(0, inside - outside)) / degrees : heat / (end - start);
      const local = localHour(h, climate.longitude);
      const water16 = local >= 6 && local < 22 ? waterHour : 0;
      if (auto) {
        const cop = pumpCop(
          heating.source,
          curveFlow(flow!, outside, inside, building.envelope.outside),
          outside,
        );
        hourlyHeating[h] = part / cop;
        // The hot water heater of the heating is the heat pump, unless it is electric.
        hourlyHotWater[h] =
          building.envelope.hotWater.heater === "electric"
            ? water16
            : water16 / pumpCop(heating.source, HOT_WATER_FLOW, outside);
      } else {
        hourlyHeating[h] = part / heating.efficiency;
        hourlyHotWater[h] = (water16 * water.final) / Math.max(water.heat, 1e-9);
      }
      final += hourlyHeating[h];
      waterFinal += hourlyHotWater[h];
    }
    pumpHeat +=
      heat + (building.envelope.hotWater.heater === "electric" ? 0 : water.heat * MONTH_DAYS[m]);
    month.final = final;
    month.hotWaterFinal = waterFinal;
    start = end;
  });

  const sum = (key: keyof MonthEnergy) => months.reduce((total, m) => total + m[key], 0);
  const demand = sum("demand");
  const final = sum("final");
  const hotWaterFinal = sum("hotWaterFinal");
  const heatingElectric = info.energy === "electricity";
  // The electricity of each month, and the part of it that the PV of the month covers.
  const electricOf = (m: MonthEnergy) =>
    (heatingElectric ? m.final : 0) + (water.electric ? m.hotWaterFinal : 0);
  const pvCovered = months.reduce((total, m) => total + Math.min(electricOf(m), m.pv), 0);
  const perArea = demand / area;
  const pumpFinal = final + (building.envelope.hotWater.heater === "electric" ? 0 : hotWaterFinal);
  return {
    months,
    area,
    demand,
    perArea,
    efficiencyClass: efficiencyClass(perArea),
    final,
    hotWater: sum("hotWater"),
    hotWaterFinal,
    hotWaterElectric: water.electric,
    cost: final * heatingPrice(building) + hotWaterFinal * water.price,
    co2: final * info.co2 + hotWaterFinal * water.co2,
    electric: months.reduce((total, m) => total + electricOf(m), 0),
    pvCovered,
    hourlyHeating,
    hourlyHotWater,
    spf: pump && pumpFinal > 0 ? pumpHeat / pumpFinal : null,
    flow,
    flowSource,
  };
}

/** The PV yield of the building in each month, in kWh: the sum of its hours, with the shade. */
function pvMonthly(building: Building): number[] {
  const hourly = pvHourly(building);
  return MONTH_DAYS.map((_, m) => {
    if (!hourly) return 0;
    let sum = 0;
    for (let h = MONTH_HOURS[m]; h < MONTH_HOURS[m + 1]; h++) sum += hourly[h];
    return sum;
  });
}
