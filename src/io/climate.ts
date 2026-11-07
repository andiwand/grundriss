// The place search and the climate download from Open-Meteo. Both APIs send
// "Access-Control-Allow-Origin: *", so the browser can call them directly. The app calls them
// only when the user clicks a button, because the request sends the place to open-meteo.com.
//
// Endpoints:
// - https://geocoding-api.open-meteo.com/v1/search?name=...: places with their coordinates.
// - https://archive-api.open-meteo.com/v1/archive: the hourly weather of past years (ERA5 and
//   other reanalysis models). One request gets all years. It costs about 100 of the 600 calls
//   per minute of the free plan.
//
// The data has the license CC BY 4.0. The app shows "Weather data by Open-Meteo.com". The free
// API is for non-commercial use.
//
// PVGIS has better radiation data for Europe, but it sends no CORS header, so the browser cannot
// call it.

import { climateFromData, type HourlyData } from "../model/climate";
import type { Climate } from "../model/types";

const GEOCODING = "https://geocoding-api.open-meteo.com/v1/search";
const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
export const CLIMATE_SOURCE = "Open-Meteo historical weather API";
export const ATTRIBUTION = "Weather data by Open-Meteo.com";
export const ATTRIBUTION_URL = "https://open-meteo.com/";
/** The number of complete years for the typical year. */
export const CLIMATE_YEARS = 10;
/** The archive has the data of a day after about this many days. */
const ARCHIVE_DELAY_DAYS = 10;
const VARIABLES = {
  temperature: "temperature_2m",
  ghi: "shortwave_radiation",
  dni: "direct_normal_irradiance",
  dhi: "diffuse_radiation",
} as const;

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** A result of the place search. */
export interface Place {
  name: string;
  /** The name with the region and the country, for the list. */
  label: string;
  latitude: number;
  longitude: number;
  /** The number of people, or 0 if the answer has none. A larger place comes first. */
  population: number;
}

/** Calls the API and reads the JSON. The errors have a message for the user. */
async function getJson(url: string, fetcher: Fetch, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("The app cannot reach open-meteo.com. Check the network connection.");
  }
  if (response.status === 429) {
    throw new Error(
      "Open-Meteo has too many requests from this network now. Try again in a minute, or tomorrow.",
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    if (!response.ok) throw new Error(`Open-Meteo answered with the error ${response.status}.`);
    throw new Error("Open-Meteo sent an answer that the app cannot read. Try again later.");
  }
  if (!response.ok) {
    const reason =
      typeof data === "object" && data !== null && "reason" in data
        ? String((data as { reason: unknown }).reason)
        : "";
    throw new Error(
      `Open-Meteo answered with the error ${response.status}${reason ? `: ${reason}` : "."}`,
    );
  }
  return data;
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** The places from the answer of the geocoding API. An answer without results has no list. */
export function placesFromAnswer(data: unknown): Place[] {
  if (typeof data !== "object" || data === null) {
    throw new Error("Open-Meteo sent an answer that the app cannot read. Try again later.");
  }
  const results = (data as { results?: unknown }).results;
  if (results == null) return [];
  if (!Array.isArray(results)) {
    throw new Error("Open-Meteo sent an answer that the app cannot read. Try again later.");
  }
  const places: Place[] = [];
  for (const r of results as Record<string, unknown>[]) {
    if (typeof r?.name !== "string" || !isNumber(r.latitude) || !isNumber(r.longitude)) continue;
    const parts = [r.name, r.admin1, r.country].filter(
      (p, i, all): p is string => typeof p === "string" && p !== "" && all.indexOf(p) === i,
    );
    places.push({
      name: r.name,
      label: parts.join(", "),
      latitude: r.latitude,
      longitude: r.longitude,
      population: isNumber(r.population) ? r.population : 0,
    });
  }
  return places;
}

/** More languages for the place search, so that a local name like "Wien" or "Roma" works. */
const SEARCH_LANGUAGES = ["de", "fr", "es", "it"];

/**
 * Searches places by name. The API finds a name only in the language of the request: "Wien"
 * finds Vienna in German, but not in English. People often type the local name of a place, so
 * the function searches in the language of the browser, in English, and in the languages of
 * SEARCH_LANGUAGES, and it puts the larger places first.
 */
export async function searchPlaces(
  query: string,
  options: { count?: number; fetcher?: Fetch; signal?: AbortSignal; languages?: string[] } = {},
): Promise<Place[]> {
  const name = query.trim();
  if (name.length < 2) return [];
  const browser = typeof navigator === "undefined" ? "en" : navigator.language.slice(0, 2);
  const languages = [...new Set(options.languages ?? [browser || "en", "en", ...SEARCH_LANGUAGES])];
  const fetcher = options.fetcher ?? fetch.bind(globalThis);
  const answers = await Promise.all(
    languages.map((language) => {
      const params = new URLSearchParams({
        name,
        count: String(options.count ?? 8),
        language,
        format: "json",
      });
      return getJson(`${GEOCODING}?${params}`, fetcher, options.signal).then(placesFromAnswer);
    }),
  );
  // The same place comes once, in the first language that finds it.
  const places: Place[] = [];
  const seen = new Set<string>();
  for (const place of answers.flat()) {
    const key = `${place.latitude.toFixed(3)},${place.longitude.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places.push(place);
  }
  return places.sort((a, b) => b.population - a.population).slice(0, options.count ?? 8);
}

/** The last CLIMATE_YEARS complete years that the archive has on the day `today`. */
export function climateYears(today: Date): { firstYear: number; lastYear: number } {
  const available = new Date(today.getTime() - ARCHIVE_DELAY_DAYS * 86400000);
  const lastYear = available.getUTCFullYear() - 1;
  return { firstYear: lastYear - CLIMATE_YEARS + 1, lastYear };
}

/** The hourly data from the answer of the archive API. It throws if the answer is not valid. */
export function hourlyFromAnswer(data: unknown): HourlyData {
  const bad = () =>
    new Error("Open-Meteo sent weather data that the app cannot read. Try again later.");
  if (typeof data !== "object" || data === null) throw bad();
  const hourly = (data as { hourly?: Record<string, unknown> }).hourly;
  if (typeof hourly !== "object" || hourly === null || !Array.isArray(hourly.time)) throw bad();
  const time = hourly.time as unknown[];
  if (!time.every((t) => typeof t === "string")) throw bad();
  const column = (key: string): (number | null)[] => {
    const values = hourly[key];
    if (!Array.isArray(values) || values.length !== time.length) throw bad();
    return values.map((v) => (isNumber(v) ? v : null));
  };
  return {
    time: time as string[],
    temperature: column(VARIABLES.temperature),
    ghi: column(VARIABLES.ghi),
    dni: column(VARIABLES.dni),
    dhi: column(VARIABLES.dhi),
  };
}

/** The URL of the archive request for the years. */
export function archiveUrl(
  latitude: number,
  longitude: number,
  years: { firstYear: number; lastYear: number },
): string {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    start_date: `${years.firstYear}-01-01`,
    end_date: `${years.lastYear}-12-31`,
    hourly: Object.values(VARIABLES).join(","),
    timezone: "UTC",
  });
  return `${ARCHIVE}?${params}`;
}

/**
 * Downloads the hourly weather of the last CLIMATE_YEARS complete years for the place, and
 * makes the typical year to store in the building. This sends the coordinates to open-meteo.com.
 */
export async function downloadClimate(
  latitude: number,
  longitude: number,
  options: { today?: Date; fetcher?: Fetch; signal?: AbortSignal } = {},
): Promise<Climate> {
  if (!(Math.abs(latitude) <= 90) || !(Math.abs(longitude) <= 180)) {
    throw new Error("The latitude must be from −90 to 90 and the longitude from −180 to 180.");
  }
  const today = options.today ?? new Date();
  const years = climateYears(today);
  const data = await getJson(
    archiveUrl(latitude, longitude, years),
    options.fetcher ?? fetch.bind(globalThis),
    options.signal,
  );
  const hourly = hourlyFromAnswer(data);
  try {
    return climateFromData(hourly, {
      source: CLIMATE_SOURCE,
      latitude,
      longitude,
      ...years,
      downloaded: today.toISOString().slice(0, 10),
    });
  } catch (error) {
    throw new Error(
      `Open-Meteo sent incomplete weather data for this place. ${(error as Error).message}`,
    );
  }
}
