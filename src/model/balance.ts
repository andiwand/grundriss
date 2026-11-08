// The hourly balance of electricity: the household, the electric heating, and the electric hot
// water against the PV and the battery, for each hour of the typical year of the climate. It gives
// the self-consumption, the self-sufficiency, the electricity from and to the grid, and the
// energy cost per year. It is an estimate, not a simulation of real devices.
//
// The loads of each hour:
//
// - household: the electricity per year, split by DAY_PROFILE over the hours of the day (local
//   solar time) and by a cosine over the year: SEASON more in winter, SEASON less in summer.
// - heating: the electricity of the heating of each month (heating.ts), split over the hours of
//   the month by the degree hours: inside temperature minus the temperature of the hour.
// - hot water: the electricity of the hot water of each day, split evenly over 6:00 to 22:00.
//
// The PV of each hour comes from the hourly yield of each face (climate.ts). The battery charges
// with the surplus of the PV and gives it back when the load is higher. Each way loses
// 1 − BATTERY_EFFICIENCY. Its power is BATTERY_POWER times its capacity per hour.

import { climateFace, climateSeries, HOURS, MONTH_DAYS } from "./climate";
import { HEATING_KINDS, heatingEnergy, heatingPrice, hotWaterDay } from "./heating";
import { pvLayout } from "./pv";
import type { Building } from "./types";

/** The household electricity of each hour of a mean day, local time, relative to the mean. */
export const DAY_PROFILE = [
  0.55, 0.45, 0.4, 0.4, 0.4, 0.5, 0.8, 1.15, 1.1, 0.95, 0.9, 0.95, 1.05, 1.0, 0.9, 0.9, 1.0, 1.25,
  1.55, 1.7, 1.6, 1.35, 1.0, 0.75,
];
/** The household uses this part more in winter than the mean, and less in summer. */
export const SEASON = 0.15;
/** The efficiency of the battery for one way: charge or discharge. */
export const BATTERY_EFFICIENCY = 0.95;
/** The power of the battery per hour, as a part of its capacity. */
export const BATTERY_POWER = 0.5;

export interface MonthBalance {
  /** The load, the PV, the PV that the building uses, and the grid, in kWh. */
  load: number;
  pv: number;
  selfUsed: number;
  imported: number;
  exported: number;
}

export interface EnergyBalance {
  months: MonthBalance[];
  /** The electricity per year in kWh: all loads, and the household, the heating, the hot water. */
  load: number;
  household: number;
  heating: number;
  hotWater: number;
  /** The PV yield, the part of it that the building uses, and the grid, in kWh per year. */
  pv: number;
  selfUsed: number;
  imported: number;
  exported: number;
  /** The part of the PV that the building uses, and the part of the load that the PV gives. */
  selfConsumption: number;
  selfSufficiency: number;
  /** The energy that the battery gives back per year, in kWh. */
  fromBattery: number;
  /**
   * The cost per year: the electricity from the grid, the payment for the electricity to the
   * grid, the fuel of a heating without electricity, and the sum.
   */
  electricityCost: number;
  feedInRevenue: number;
  fuelCost: number;
  cost: number;
  /** The CO₂ per year in kg: the electricity from the grid and the fuel. */
  co2: number;
}

/** The hour of the year (0 to 8759) where each month starts. */
const MONTH_START = MONTH_DAYS.reduce<number[]>(
  (starts, days, m) => [...starts, (starts[m] ?? 0) + days * 24],
  [0],
);

/**
 * The hourly balance of electricity of the building, or null without a climate. A building
 * without rooms has only the household.
 */
export function energyBalance(building: Building): EnergyBalance | null {
  const climate = building.climate;
  if (!climate) return null;
  const { household, envelope } = building;
  const temperature = climateSeries(climate).temperature;
  // The local solar time: the UTC hour moved by the longitude.
  const offset = Math.round(climate.longitude / 15);
  const heating = heatingEnergy(building);
  const heatingElectric = HEATING_KINDS[envelope.heating.kind].energy === "electricity";
  const water = hotWaterDay(building);

  // The loads of each hour.
  const load = new Float64Array(HOURS);
  const profileSum = DAY_PROFILE.reduce((sum, v) => sum + v, 0);
  let seasonSum = 0;
  for (let h = 0; h < HOURS; h++) {
    const day = Math.floor(h / 24);
    const local = (((h + offset) % 24) + 24) % 24;
    const season = 1 + SEASON * Math.cos((2 * Math.PI * (day - 15)) / 365);
    load[h] = (DAY_PROFILE[local] / profileSum) * season;
    seasonSum += season;
  }
  // The sum of the loads of the household is its electricity per year.
  const daily = seasonSum / 24;
  for (let h = 0; h < HOURS; h++) load[h] *= household.electricity / daily;

  let heatingLoad = 0;
  let hotWaterLoad = 0;
  if (heating) {
    heating.months.forEach((month, m) => {
      const start = MONTH_START[m];
      const end = MONTH_START[m + 1];
      if (heatingElectric && month.final > 0) {
        let sum = 0;
        for (let h = start; h < end; h++) sum += Math.max(0, envelope.inside - temperature[h]);
        for (let h = start; h < end; h++) {
          const share =
            sum > 0 ? Math.max(0, envelope.inside - temperature[h]) / sum : 1 / (end - start);
          load[h] += month.final * share;
        }
        heatingLoad += month.final;
      }
      if (water.electric && month.hotWaterFinal > 0) {
        // 16 hours of each day of the month, from 6:00 to 22:00 local time.
        const share = month.hotWaterFinal / (((end - start) / 24) * 16);
        for (let h = start; h < end; h++) {
          const local = (((h + offset) % 24) + 24) % 24;
          if (local >= 6 && local < 22) load[h] += share;
        }
        hotWaterLoad += month.hotWaterFinal;
      }
    });
  }

  // The PV of each hour, from the hourly yield of each direction of each field.
  const pv = new Float64Array(HOURS);
  for (const array of building.pv) {
    const layout = pvLayout(building, array);
    if (!layout) continue;
    for (const part of layout.parts) {
      const hourly = climateFace(climate, part.tilt, part.azimuth).hourly;
      for (let h = 0; h < HOURS; h++) pv[h] += part.peak * hourly[h];
    }
  }

  // The battery, hour by hour. It starts empty.
  const capacity = Math.max(0, household.battery);
  const power = capacity * BATTERY_POWER;
  let charge = 0;
  let fromBattery = 0;
  const months: MonthBalance[] = MONTH_DAYS.map(() => ({
    load: 0,
    pv: 0,
    selfUsed: 0,
    imported: 0,
    exported: 0,
  }));
  let m = 0;
  for (let h = 0; h < HOURS; h++) {
    while (h >= MONTH_START[m + 1]) m++;
    const month = months[m];
    const net = pv[h] - load[h];
    let imported = 0;
    let exported = 0;
    if (net >= 0) {
      const stored = Math.min(net, power, (capacity - charge) / BATTERY_EFFICIENCY);
      charge += stored * BATTERY_EFFICIENCY;
      exported = net - stored;
    } else {
      const need = -net;
      const given = Math.min(need, power, charge * BATTERY_EFFICIENCY);
      charge -= given / BATTERY_EFFICIENCY;
      fromBattery += given;
      imported = need - given;
    }
    month.load += load[h];
    month.pv += pv[h];
    month.imported += imported;
    month.exported += exported;
    // The building uses the PV that does not go to the grid: directly or later from the battery.
    month.selfUsed += pv[h] - exported;
  }

  const sum = (key: keyof MonthBalance) => months.reduce((total, x) => total + x[key], 0);
  const totalLoad = sum("load");
  const totalPv = sum("pv");
  const imported = sum("imported");
  const exported = sum("exported");
  const selfUsed = sum("selfUsed");

  // The fuel of a heating or a hot water without electricity.
  const info = HEATING_KINDS[envelope.heating.kind];
  const fuelHeating = heating && !heatingElectric ? heating.final : 0;
  const fuelWater = heating && !water.electric ? heating.hotWaterFinal : 0;
  const fuelCost = fuelHeating * heatingPrice(building) + fuelWater * water.price;
  const electricityCost = imported * household.price;
  const feedInRevenue = exported * household.feedIn;
  return {
    months,
    load: totalLoad,
    household: household.electricity,
    heating: heatingLoad,
    hotWater: hotWaterLoad,
    pv: totalPv,
    selfUsed,
    imported,
    exported,
    selfConsumption: totalPv > 0 ? selfUsed / totalPv : 0,
    selfSufficiency: totalLoad > 0 ? 1 - imported / totalLoad : 0,
    fromBattery,
    electricityCost,
    feedInRevenue,
    fuelCost,
    cost: electricityCost - feedInRevenue + fuelCost,
    co2: imported * HEATING_KINDS.electric.co2 + (fuelHeating + fuelWater) * info.co2,
  };
}
