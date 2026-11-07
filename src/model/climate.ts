// The climate of the location: a typical year of hourly radiation and temperature, and the values
// that come from it. This module has no DOM and no network. `src/io/climate.ts` downloads the data.
//
// The typical year has 8760 hours in UTC, from 1 January 00:00. Each value is the mean of the
// hour that ends at its time, as in the Open-Meteo archive. So the sun position for hour h is at
// h − 0.5 h. February 29 is not in the year.
//
// The methods:
// - The sun position: the NOAA solar calculator (after Meeus), without refraction. The error is
//   less than about 0.05°, which is enough for a yearly sum.
// - The irradiance on a tilted face: the Hay–Davies model. The direct normal irradiance (DNI)
//   gives the beam part. The diffuse part has a circumsolar part (the anisotropy index
//   A = DNI / extraterrestrial DNI) and an isotropic part. The ground reflects the global
//   horizontal irradiance with the albedo ALBEDO.
// - The PV yield: the angle losses of the glass (Martin & Ruiz, a_r = 0.16), the cell temperature
//   Tc = Ta + CELL_HEATING · G, a temperature coefficient of TEMPERATURE_COEFFICIENT, and
//   SYSTEM_LOSS for the inverter, the cables, dirt, and mismatch (as the default of PVGIS).
// - The heating degree days: the German "Gradtagzahl" G20/15 (VDI 3807): the sum of (20 °C − Tm)
//   over the days with a daily mean Tm below 15 °C.
// - The design temperature: the lowest mean of 48 hours in a row in the downloaded years.
//
// The stored series are compact: each value is an integer (W/m², or 0.1 °C), the difference to
// the value before it goes into an Int16 array, fflate deflates the bytes, and the result is
// base64. A year of four series is about 40 kB.

import { deflateSync, inflateSync } from "fflate";
import type { Climate } from "./types";

/** The hours of the typical year. */
export const HOURS = 8760;
/** The reflectance of the ground. */
export const ALBEDO = 0.2;
/** The solar constant in W/m². */
export const SOLAR_CONSTANT = 1361;
/** The losses of the system after the module: inverter, cables, dirt, and mismatch. */
export const SYSTEM_LOSS = 0.14;
/** The change of the module power per K of cell temperature. */
export const TEMPERATURE_COEFFICIENT = -0.004;
/** The cell is this much warmer than the air per W/m² on the module, for a roof with a gap. */
export const CELL_HEATING = 0.035;
/** The base and the limit of the heating degree days, in °C (G20/15). */
export const DEGREE_DAY_BASE = 20;
export const DEGREE_DAY_LIMIT = 15;
/** The calendar year for the sun positions. Any year without February 29 is good. */
const SUN_YEAR = 2021;
/** The days of the months in a year without February 29. */
export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const RAD = Math.PI / 180;

/** The hourly series of a typical year. */
export interface ClimateSeries {
  /** Global horizontal irradiance in W/m². */
  ghi: Float32Array;
  /** Direct normal irradiance in W/m². */
  dni: Float32Array;
  /** Diffuse horizontal irradiance in W/m². */
  dhi: Float32Array;
  /** Air temperature at 2 m in °C. */
  temperature: Float32Array;
}

// ----- Storage -----

const SCALES = { ghi: 1, dni: 1, dhi: 1, temperature: 10 } as const;
export type SeriesName = keyof typeof SCALES;
export const SERIES_NAMES = Object.keys(SCALES) as SeriesName[];

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encodes a series of HOURS values for the file. `name` gives the unit of the integers. */
export function encodeSeries(name: SeriesName, values: ArrayLike<number>): string {
  const scale = SCALES[name];
  const deltas = new Int16Array(values.length);
  let last = 0;
  for (let i = 0; i < values.length; i++) {
    const value = Math.max(-32000, Math.min(32000, Math.round(values[i] * scale)));
    deltas[i] = value - last;
    last = value;
  }
  // An Int16Array uses the byte order of the platform. All browsers use little endian.
  const bytes = new Uint8Array(deltas.buffer);
  return toBase64(deflateSync(bytes, { level: 9 }));
}

/** Decodes a series of the file. It throws if the text is not a series of HOURS values. */
export function decodeSeries(name: SeriesName, text: string): Float32Array {
  let bytes: Uint8Array;
  try {
    bytes = inflateSync(fromBase64(text));
  } catch {
    throw new Error(`The climate series "${name}" is not valid.`);
  }
  if (bytes.length !== HOURS * 2) {
    throw new Error(`The climate series "${name}" does not have ${HOURS} hours.`);
  }
  const deltas = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + HOURS * 2));
  const values = new Float32Array(HOURS);
  const scale = SCALES[name];
  let value = 0;
  for (let i = 0; i < HOURS; i++) {
    value += deltas[i];
    values[i] = value / scale;
  }
  return values;
}

/** The decoded series and the computed values of one climate. */
interface Decoded {
  key: string[];
  series: ClimateSeries;
  sun: Float64Array;
  /** The yields per kWp and the irradiations, by tilt and azimuth. */
  faces: Map<string, FaceResult>;
}

/** A transaction copies the building, so the cache compares the text of the series. */
const cache: Decoded[] = [];
const CACHE_SIZE = 4;

function decoded(climate: Climate): Decoded {
  const key = SERIES_NAMES.map((name) => climate[name]);
  const hit = cache.find((d) => d.key.every((text, i) => text === key[i]));
  if (hit) return hit;
  const series = {} as ClimateSeries;
  for (const name of SERIES_NAMES) series[name] = decodeSeries(name, climate[name]);
  const entry: Decoded = {
    key,
    series,
    sun: sunPath(climate.latitude, climate.longitude),
    faces: new Map(),
  };
  cache.unshift(entry);
  cache.length = Math.min(cache.length, CACHE_SIZE);
  return entry;
}

/** The hourly series of the climate. */
export const climateSeries = (climate: Climate): ClimateSeries => decoded(climate).series;

// ----- The sun -----

export interface SunPosition {
  /** The angle from the zenith in degrees. */
  zenith: number;
  /** The direction in degrees from north, clockwise. */
  azimuth: number;
  /** The declination in degrees. */
  declination: number;
  /** The equation of time in minutes. */
  equationOfTime: number;
  /** The unit vector to the sun: east, north, up. */
  east: number;
  north: number;
  up: number;
}

/**
 * The position of the sun at a time (milliseconds since 1970 in UTC) for a latitude and a
 * longitude in degrees (east positive). The NOAA solar calculator, without refraction.
 */
export function sunPosition(time: number, latitude: number, longitude: number): SunPosition {
  const julianDay = time / 86400000 + 2440587.5;
  const t = (julianDay - 2451545) / 36525;
  const meanLongitude = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const m = meanAnomaly * RAD;
  const center =
    Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m) * 0.000289;
  const omega = (125.04 - 1934.136 * t) * RAD;
  const apparentLongitude = (meanLongitude + center - 0.00569 - 0.00478 * Math.sin(omega)) * RAD;
  const meanObliquity =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = (meanObliquity + 0.00256 * Math.cos(omega)) * RAD;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude));
  const y = Math.tan(obliquity / 2) ** 2;
  const l0 = meanLongitude * RAD;
  const equationOfTime =
    (4 / RAD) *
    (y * Math.sin(2 * l0) -
      2 * eccentricity * Math.sin(m) +
      4 * eccentricity * y * Math.sin(m) * Math.cos(2 * l0) -
      0.5 * y * y * Math.sin(4 * l0) -
      1.25 * eccentricity * eccentricity * Math.sin(2 * m));
  const minutes = (((time / 60000) % 1440) + 1440) % 1440;
  const solarTime = (((minutes + equationOfTime + 4 * longitude) % 1440) + 1440) % 1440;
  // The hour angle is 0 at the solar noon and positive in the afternoon.
  const hourAngle = (solarTime / 4 - 180) * RAD;
  const phi = latitude * RAD;
  const east = -Math.cos(declination) * Math.sin(hourAngle);
  const north =
    Math.cos(phi) * Math.sin(declination) -
    Math.sin(phi) * Math.cos(declination) * Math.cos(hourAngle);
  const up =
    Math.sin(phi) * Math.sin(declination) +
    Math.cos(phi) * Math.cos(declination) * Math.cos(hourAngle);
  const azimuth = (((Math.atan2(east, north) / RAD) % 360) + 360) % 360;
  return {
    zenith: Math.acos(Math.max(-1, Math.min(1, up))) / RAD,
    azimuth,
    declination: declination / RAD,
    equationOfTime,
    east,
    north,
    up,
  };
}

/** The time of the middle of hour `hour` of the typical year, in milliseconds (UTC). */
export const hourMiddle = (hour: number) => Date.UTC(SUN_YEAR, 0, 1) + (hour - 0.5) * 3600000;

/** The unit vector to the sun (east, north, up) in the middle of each hour of the year. */
export function sunPath(latitude: number, longitude: number): Float64Array {
  const path = new Float64Array(HOURS * 3);
  for (let h = 0; h < HOURS; h++) {
    const sun = sunPosition(hourMiddle(h), latitude, longitude);
    path[h * 3] = sun.east;
    path[h * 3 + 1] = sun.north;
    path[h * 3 + 2] = sun.up;
  }
  return path;
}

/** The DNI outside the atmosphere on the day of the hour, in W/m². */
const extraterrestrial = (hour: number) =>
  SOLAR_CONSTANT * (1 + 0.033 * Math.cos((2 * Math.PI * Math.floor(hour / 24)) / 365));

// ----- Faces -----

/** The unit normal of a face (east, north, up). The azimuth is from north, clockwise. */
function normalOf(tilt: number, azimuth: number): [number, number, number] {
  const b = tilt * RAD;
  const a = azimuth * RAD;
  return [Math.sin(b) * Math.sin(a), Math.sin(b) * Math.cos(a), Math.cos(b)];
}

/** The irradiance on a face in one hour, in W/m², by part. */
export interface FaceIrradiance {
  beam: number;
  diffuse: number;
  ground: number;
  /** The cosine of the angle between the sun and the normal of the face, or 0. */
  cosIncidence: number;
}

/** The cosine of the zenith angle for the circumsolar part has this lower limit (about 85°). */
const MIN_COS_ZENITH = 0.0872;

/**
 * The irradiance on a face of `tilt` degrees that points to `azimuth` (degrees from north,
 * clockwise) in hour `hour`, by the Hay–Davies model. `sun` comes from `sunPath`.
 */
export function faceIrradiance(
  series: ClimateSeries,
  sun: Float64Array,
  hour: number,
  tilt: number,
  azimuth: number,
): FaceIrradiance {
  const [nx, ny, nz] = normalOf(tilt, azimuth);
  return irradianceAt(series, sun, hour, nx, ny, nz);
}

function irradianceAt(
  series: ClimateSeries,
  sun: Float64Array,
  h: number,
  nx: number,
  ny: number,
  nz: number,
): FaceIrradiance {
  const ghi = Math.max(0, series.ghi[h]);
  const dni = Math.max(0, series.dni[h]);
  const dhi = Math.max(0, series.dhi[h]);
  const cosZenith = sun[h * 3 + 2];
  const cosIncidence =
    cosZenith > 0 ? Math.max(0, sun[h * 3] * nx + sun[h * 3 + 1] * ny + cosZenith * nz) : 0;
  const beam = dni * cosIncidence;
  // When the sun is below the horizon in the middle of the hour, all diffuse light is isotropic.
  const anisotropy = cosZenith > 0 ? Math.min(1, dni / extraterrestrial(h)) : 0;
  const circumsolar = (dhi * anisotropy * cosIncidence) / Math.max(cosZenith, MIN_COS_ZENITH);
  const isotropic = (dhi * (1 - anisotropy) * (1 + nz)) / 2;
  const ground = (ghi * ALBEDO * (1 - nz)) / 2;
  return { beam: beam + circumsolar, diffuse: isotropic, ground, cosIncidence };
}

/** The yearly results of a face. */
export interface FaceResult {
  /** The irradiation on the face in kWh/m² per year. */
  irradiation: number;
  /** The yield of 1 kWp in kWh per year. */
  yield: number;
}

/** The angle factor of the glass for the beam (Martin & Ruiz). */
const AR = 0.16;
const beamAngleFactor = (cosIncidence: number) =>
  (1 - Math.exp(-cosIncidence / AR)) / (1 - Math.exp(-1 / AR));

/** The angle factor of the glass for isotropic light from a part of the sphere (Martin & Ruiz). */
function diffuseAngleFactor(angle: number): number {
  const c1 = 4 / (3 * Math.PI);
  const c2 = 0.5 * AR - 0.154;
  const s = Math.sin(angle);
  const x = s + (Math.PI - angle - s) / (1 + Math.cos(angle));
  return 1 - Math.exp((-1 / AR) * (c1 * x + c2 * x * x));
}

/** The yearly irradiation and the PV yield per kWp of a face, from the series and the sun path. */
export function faceYear(
  series: ClimateSeries,
  sun: Float64Array,
  tilt: number,
  azimuth: number,
): FaceResult {
  const [nx, ny, nz] = normalOf(tilt, azimuth);
  const b = Math.max(tilt, 0.01) * RAD;
  const skyFactor = diffuseAngleFactor(b);
  const groundFactor = diffuseAngleFactor(Math.PI - b);
  let irradiation = 0;
  let energy = 0;
  for (let h = 0; h < HOURS; h++) {
    const part = irradianceAt(series, sun, h, nx, ny, nz);
    const total = part.beam + part.diffuse + part.ground;
    if (total <= 0) continue;
    irradiation += total;
    const effective =
      part.beam * beamAngleFactor(part.cosIncidence) +
      part.diffuse * skyFactor +
      part.ground * groundFactor;
    const cell = series.temperature[h] + CELL_HEATING * total;
    energy += Math.max(0, effective * (1 + TEMPERATURE_COEFFICIENT * (cell - 25)));
  }
  return { irradiation: irradiation / 1000, yield: (energy / 1000) * (1 - SYSTEM_LOSS) };
}

const FACE_CACHE_SIZE = 500;

/** The results of a face for the stored climate. The cache keeps them. */
export function climateFace(climate: Climate, tilt: number, azimuth: number): FaceResult {
  const entry = decoded(climate);
  // A flat face has the same result in each direction.
  const key = tilt < 0.05 ? "flat" : `${tilt.toFixed(1)}:${azimuth.toFixed(1)}`;
  let result = entry.faces.get(key);
  if (!result) {
    // A drag of a roof makes many tilts, so the cache starts again when it is full.
    if (entry.faces.size >= FACE_CACHE_SIZE) entry.faces.clear();
    result = faceYear(entry.series, entry.sun, tilt, azimuth);
    entry.faces.set(key, result);
  }
  return result;
}

/** The yield of 1 kWp on a face, in kWh per year, for the stored climate. */
export const pvYieldPerKwp = (climate: Climate, tilt: number, azimuth: number): number =>
  climateFace(climate, tilt, azimuth).yield;

/** The tilt toward south (north on the southern half) with the highest yield, in steps of 1°. */
export function optimumFace(climate: Climate): { tilt: number; azimuth: number; yield: number } {
  const azimuth = climate.latitude >= 0 ? 180 : 0;
  let best = { tilt: 0, azimuth, yield: pvYieldPerKwp(climate, 0, azimuth) };
  for (let tilt = 1; tilt <= 70; tilt++) {
    const value = pvYieldPerKwp(climate, tilt, azimuth);
    if (value > best.yield) best = { tilt, azimuth, yield: value };
  }
  return best;
}

// ----- Temperature -----

/** The mean temperature of each month of the typical year, in °C. */
export function monthlyMeans(temperature: ArrayLike<number>): number[] {
  const result: number[] = [];
  let hour = 0;
  for (const days of MONTH_DAYS) {
    let sum = 0;
    for (let i = 0; i < days * 24; i++) sum += temperature[hour + i];
    result.push(sum / (days * 24));
    hour += days * 24;
  }
  return result;
}

/** The mean of the values. */
export function mean(values: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return values.length > 0 ? sum / values.length : NaN;
}

/**
 * The heating degree days per year (G20/15, K·d) of an hourly series from 00:00 of a day. The
 * series can have more than one year. The result is the sum divided by the number of years.
 */
export function degreeDays(
  temperature: ArrayLike<number>,
  base = DEGREE_DAY_BASE,
  limit = DEGREE_DAY_LIMIT,
): number {
  const days = Math.floor(temperature.length / 24);
  let sum = 0;
  for (let d = 0; d < days; d++) {
    let daily = 0;
    for (let i = 0; i < 24; i++) daily += temperature[d * 24 + i];
    daily /= 24;
    if (daily < limit) sum += base - daily;
  }
  return days > 0 ? (sum * 365) / days : 0;
}

/** The design temperature: the lowest mean of 48 hours in a row of an hourly series, in °C. */
export function designTemperature(temperature: ArrayLike<number>): number {
  const window = 48;
  if (temperature.length < window) return mean(temperature);
  let sum = 0;
  for (let i = 0; i < window; i++) sum += temperature[i];
  let lowest = sum;
  for (let i = window; i < temperature.length; i++) {
    sum += temperature[i] - temperature[i - window];
    lowest = Math.min(lowest, sum);
  }
  return lowest / window;
}

// ----- The typical year -----

/** The hourly data of several years, as the Open-Meteo archive gives it. */
export interface HourlyData {
  /** The times in UTC, "YYYY-MM-DDTHH:MM". */
  time: string[];
  ghi: (number | null)[];
  dni: (number | null)[];
  dhi: (number | null)[];
  temperature: (number | null)[];
}

/** The first day of each month in the year, from 0. */
const MONTH_START = MONTH_DAYS.reduce<number[]>((s, d, i) => [...s, s[i] + d], [0]);

/**
 * The index of a time "YYYY-MM-DDTHH:MM" in the typical year, or −1 for February 29 or a time
 * that the function cannot read.
 */
export function hourOfYear(time: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})/.exec(time);
  if (!match) return -1;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  if (month < 1 || month > 12 || hour > 23 || day < 1 || day > MONTH_DAYS[month - 1]) return -1;
  return (MONTH_START[month - 1] + day - 1) * 24 + hour;
}

/**
 * The typical year of hourly data: the mean of each hour of the year over all years. February 29
 * is not in it. It throws if an hour of the year has no value.
 */
export function typicalYear(data: HourlyData): ClimateSeries {
  const result = {} as ClimateSeries;
  for (const name of SERIES_NAMES) {
    const values = data[name];
    if (values.length !== data.time.length) {
      throw new Error(`The weather data has the wrong number of values for "${name}".`);
    }
    const sum = new Float64Array(HOURS);
    const count = new Uint16Array(HOURS);
    for (let i = 0; i < data.time.length; i++) {
      const value = values[i];
      const hour = hourOfYear(data.time[i]);
      if (hour < 0 || typeof value !== "number" || !Number.isFinite(value)) continue;
      sum[hour] += value;
      count[hour]++;
    }
    const series = new Float32Array(HOURS);
    for (let h = 0; h < HOURS; h++) {
      if (count[h] === 0) throw new Error(`The weather data has gaps in "${name}".`);
      series[h] = sum[h] / count[h];
    }
    result[name] = series;
  }
  return result;
}

/** The temperatures of all years in order. A missing value takes the value before it. */
export function temperatureRecord(data: HourlyData): Float32Array {
  const result = new Float32Array(data.temperature.length);
  let last = 0;
  data.temperature.forEach((value, i) => {
    if (typeof value === "number" && Number.isFinite(value)) last = value;
    result[i] = last;
  });
  return result;
}

/**
 * The climate to store in the building, from the hourly data of whole years. The degree days and
 * the design temperature come from all years, not from the typical year, because the mean of
 * the years removes the cold spells.
 */
export function climateFromData(
  data: HourlyData,
  info: {
    source: string;
    latitude: number;
    longitude: number;
    firstYear: number;
    lastYear: number;
    downloaded: string;
  },
): Climate {
  const year = typicalYear(data);
  const record = temperatureRecord(data);
  return {
    ...info,
    degreeDays: Math.round(degreeDays(record) * 10) / 10,
    designTemperature: Math.round(designTemperature(record) * 10) / 10,
    ghi: encodeSeries("ghi", year.ghi),
    dni: encodeSeries("dni", year.dni),
    dhi: encodeSeries("dhi", year.dhi),
    temperature: encodeSeries("temperature", year.temperature),
  };
}

/** The values for the summary of the location. */
export interface ClimateSummary {
  meanTemperature: number;
  monthly: number[];
  degreeDays: number;
  designTemperature: number;
  /** The yearly global irradiation on the ground in kWh/m². */
  globalIrradiation: number;
  optimum: { tilt: number; azimuth: number; yield: number };
}

export function climateSummary(climate: Climate): ClimateSummary {
  const series = climateSeries(climate);
  return {
    meanTemperature: mean(series.temperature),
    monthly: monthlyMeans(series.temperature),
    degreeDays: climate.degreeDays,
    designTemperature: climate.designTemperature,
    globalIrradiation: (mean(series.ghi) * HOURS) / 1000,
    optimum: optimumFace(climate),
  };
}
