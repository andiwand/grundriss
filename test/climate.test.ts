import { describe, expect, it } from "vitest";
import {
  HOURS,
  climateFace,
  climateFromData,
  climateSeries,
  climateSummary,
  climateSun,
  decodeSeries,
  degreeDays,
  designTemperature,
  encodeSeries,
  hourOfYear,
  monthlyMeans,
  optimumFace,
  pvYieldPerKwp,
  sunPath,
  sunPosition,
  typicalYear,
  type HourlyData,
} from "../src/model/climate";
import {
  archiveUrl,
  climateYears,
  downloadClimate,
  hourlyFromAnswer,
  placesFromAnswer,
  searchPlaces,
} from "../src/io/climate";
import type { Climate } from "../src/model/types";
import vienna from "./fixtures/vienna-climate.json";
import archive from "./fixtures/open-meteo-archive.json";

/**
 * The typical year of Vienna (48.2 N, 16.37 E) from the Open-Meteo archive, 2016 to 2025. The
 * fixture is the stored climate, not the raw data of ten years.
 */
const climate = vienna as Climate;

describe("sun position", () => {
  it("keeps separate sun paths for places with the same weather series", () => {
    const first = climateSun(climate);
    const nearby = {
      ...climate,
      latitude: climate.latitude + 0.1,
      longitude: climate.longitude + 0.1,
    };
    const second = climateSun(nearby);
    expect(second).not.toBe(first);
    expect(second).toEqual(sunPath(nearby.latitude, nearby.longitude));
    expect(climateSun({ ...nearby })).toBe(second);
  });

  it("agrees with the reference of the NREL SPA report", () => {
    // Reda & Andreas (2004): 17 October 2003, 12:30:30 at −7 h, Golden, Colorado. The report
    // gives the zenith 50.11162° with refraction and the azimuth 194.34024°.
    const sun = sunPosition(Date.UTC(2003, 9, 17, 19, 30, 30), 39.742476, -105.1786);
    expect(sun.zenith).toBeCloseTo(50.12, 1);
    expect(sun.azimuth).toBeCloseTo(194.34, 1);
  });

  it("is highest in Vienna at the solar noon of the June solstice", () => {
    let best = { elevation: -90, minutes: 0 };
    for (let minutes = 600; minutes < 720; minutes++) {
      const sun = sunPosition(Date.UTC(2023, 5, 21, 0, minutes), 48.2, 16.37);
      if (90 - sun.zenith > best.elevation) best = { elevation: 90 - sun.zenith, minutes };
    }
    expect(best.elevation).toBeCloseTo(90 - 48.2 + 23.44, 1);
    // The noon is at 12:00 − 4 min/° · 16.37° − the equation of time (about −1.8 min) in UTC.
    expect(Math.abs(best.minutes - (720 - 65.5 + 1.8))).toBeLessThanOrEqual(1);
  });

  it("gives the declination and the equation of time of known days", () => {
    expect(sunPosition(Date.UTC(2023, 11, 21, 12), 0, 0).declination).toBeCloseTo(-23.44, 1);
    expect(sunPosition(Date.UTC(2023, 10, 3, 12), 0, 0).equationOfTime).toBeCloseTo(16.4, 0);
    expect(sunPosition(Date.UTC(2023, 1, 11, 12), 0, 0).equationOfTime).toBeCloseTo(-14.2, 0);
  });

  it("puts the hour values in the middle of the hour that ends at their time", () => {
    // On horizontal ground, DHI + DNI · cos(zenith) must give the GHI. A shift of one hour
    // gives a much larger difference.
    const series = climateSeries(climate);
    const sun = sunPath(climate.latitude, climate.longitude);
    const sum = (shift: number) => {
      let total = 0;
      for (let h = 0; h < HOURS; h++) {
        const s = (h + shift + HOURS) % HOURS;
        total += series.dhi[h] + series.dni[h] * Math.max(0, sun[s * 3 + 2]);
      }
      return total;
    };
    let ghi = 0;
    for (const value of series.ghi) ghi += value;
    expect(Math.abs(sum(0) / ghi - 1)).toBeLessThan(0.01);
    expect(Math.abs(sum(-1) / ghi - 1)).toBeGreaterThan(0.015);
    expect(Math.abs(sum(1) / ghi - 1)).toBeGreaterThan(0.005);
  });
});

describe("PV yield in Vienna", () => {
  const yieldOf = (tilt: number, azimuth: number) => pvYieldPerKwp(climate, tilt, azimuth);

  it("gives a plausible yield for south at 35°", () => {
    expect(yieldOf(35, 180)).toBeGreaterThan(1100);
    expect(yieldOf(35, 180)).toBeLessThan(1300);
    // The irradiation on the face is more than on the ground.
    expect(climateFace(climate, 35, 180).irradiation).toBeGreaterThan(
      climateFace(climate, 0, 180).irradiation * 1.1,
    );
  });

  it("gives less for other directions and tilts", () => {
    const south = yieldOf(35, 180);
    expect(yieldOf(35, 90)).toBeLessThan(south * 0.85);
    expect(yieldOf(35, 90)).toBeGreaterThan(south * 0.7);
    expect(yieldOf(35, 270)).toBeLessThan(south * 0.85);
    expect(yieldOf(35, 0)).toBeLessThan(yieldOf(35, 90) * 0.7);
    expect(yieldOf(0, 180)).toBeLessThan(south * 0.9);
    expect(yieldOf(0, 180)).toBeCloseTo(yieldOf(0, 0), 3);
    expect(yieldOf(90, 180)).toBeLessThan(south * 0.8);
  });

  it("finds the optimum tilt toward south between 30° and 45°", () => {
    const best = optimumFace(climate);
    expect(best.azimuth).toBe(180);
    expect(best.tilt).toBeGreaterThanOrEqual(30);
    expect(best.tilt).toBeLessThanOrEqual(45);
    expect(best.yield).toBeGreaterThanOrEqual(yieldOf(35, 180));
  });
});

describe("temperature", () => {
  it("gives plausible monthly means, degree days, and a design temperature for Vienna", () => {
    const summary = climateSummary(climate);
    expect(summary.meanTemperature).toBeGreaterThan(10);
    expect(summary.meanTemperature).toBeLessThan(13);
    expect(summary.monthly[0]).toBeLessThan(4);
    expect(summary.monthly[6]).toBeGreaterThan(19);
    expect(summary.monthly).toHaveLength(12);
    expect(climate.degreeDays).toBeGreaterThan(2700);
    expect(climate.degreeDays).toBeLessThan(3500);
    expect(climate.designTemperature).toBeLessThan(-5);
    expect(climate.designTemperature).toBeGreaterThan(-16);
    expect(summary.globalIrradiation).toBeGreaterThan(1150);
    expect(summary.globalIrradiation).toBeLessThan(1400);
  });

  it("counts degree days only on days below the limit", () => {
    const days = (values: number[]) => values.flatMap((v) => Array<number>(24).fill(v));
    // 365 days at 0 °C give 365 · 20 K·d.
    expect(degreeDays(days(Array<number>(365).fill(0)))).toBeCloseTo(7300);
    // A day at 16 °C is above the limit of 15 °C, and a day at 14 °C counts 6 K·d.
    expect(degreeDays(days([16, 14]))).toBeCloseTo((6 * 365) / 2);
  });

  it("finds the lowest mean of 48 hours", () => {
    const values = Array<number>(200).fill(5);
    for (let i = 100; i < 148; i++) values[i] = -10;
    values[50] = -30;
    expect(designTemperature(values)).toBeCloseTo(-10);
  });

  it("gives the monthly means of a series", () => {
    const values = new Float32Array(HOURS);
    let hour = 0;
    [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31].forEach((days, month) => {
      values.fill(month, hour, hour + days * 24);
      hour += days * 24;
    });
    expect(monthlyMeans(values)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe("typical year", () => {
  it("maps the times to the hours of a year without February 29", () => {
    expect(hourOfYear("2023-01-01T00:00")).toBe(0);
    expect(hourOfYear("2023-03-01T05:00")).toBe((31 + 28) * 24 + 5);
    expect(hourOfYear("2024-03-01T05:00")).toBe((31 + 28) * 24 + 5);
    expect(hourOfYear("2024-02-29T12:00")).toBe(-1);
    expect(hourOfYear("2023-12-31T23:00")).toBe(HOURS - 1);
    expect(hourOfYear("bad")).toBe(-1);
  });

  /** Two years of hourly data: the value of each hour is the year plus `offset`. */
  function twoYears(offset: (time: string) => number): HourlyData {
    const time: string[] = [];
    for (let t = Date.UTC(2023, 0, 1); t < Date.UTC(2025, 0, 1); t += 3600000) {
      time.push(new Date(t).toISOString().slice(0, 16));
    }
    const values = time.map((s) => Number(s.slice(0, 4)) - 2023 + offset(s));
    return { time, ghi: values, dni: values, dhi: values, temperature: values };
  }

  it("takes the mean of each hour and drops February 29", () => {
    const year = typicalYear(twoYears(() => 10));
    expect(year.ghi).toHaveLength(HOURS);
    expect(year.ghi[0]).toBeCloseTo(10.5);
    expect(year.temperature[HOURS - 1]).toBeCloseTo(10.5);
  });

  it("ignores missing values and fails on a gap", () => {
    const data = twoYears(() => 0);
    data.ghi[0] = null;
    expect(typicalYear(data).ghi[0]).toBeCloseTo(1);
    const gap = twoYears(() => 0);
    gap.dni = gap.dni.map((v, i) =>
      gap.time[i].startsWith("2023-05-01") || gap.time[i].startsWith("2024-05-01") ? null : v,
    );
    expect(() => typicalYear(gap)).toThrow(/gaps in "dni"/);
  });

  it("encodes a series compactly and decodes it again", () => {
    const series = climateSeries(climate);
    for (const name of ["ghi", "dni", "dhi", "temperature"] as const) {
      const text = encodeSeries(name, series[name]);
      expect(text).toBe(climate[name]);
      expect(decodeSeries(name, text)).toEqual(series[name]);
    }
    const size = climate.ghi.length + climate.dni.length + climate.dhi.length;
    expect(size + climate.temperature.length).toBeLessThan(60000);
    expect(() => decodeSeries("ghi", "AAAA")).toThrow();
    expect(() => decodeSeries("ghi", encodeSeries("ghi", [1, 2, 3]))).toThrow(/8760/);
  });

  it("rounds the temperature to 0.1 °C and the radiation to 1 W/m²", () => {
    const values = Array.from({ length: HOURS }, (_, i) => (i % 100) / 7 - 5);
    const decoded = decodeSeries("temperature", encodeSeries("temperature", values));
    decoded.forEach((v, i) => expect(Math.abs(v - values[i])).toBeLessThanOrEqual(0.05 + 1e-6));
  });
});

/** A fetch that answers with the JSON and the status. */
const answer =
  (data: unknown, status = 200) =>
  async () =>
    new Response(JSON.stringify(data), { status });

describe("Open-Meteo", () => {
  it("reads the places of the geocoding API", async () => {
    const data = {
      results: [
        {
          name: "Vienna",
          latitude: 48.20849,
          longitude: 16.37208,
          country: "Austria",
          admin1: "Vienna",
        },
        { name: "Broken" },
      ],
    };
    expect(placesFromAnswer(data)).toEqual([
      {
        name: "Vienna",
        label: "Vienna, Austria",
        latitude: 48.20849,
        longitude: 16.37208,
        population: 0,
      },
    ]);
    expect(placesFromAnswer({ generationtime_ms: 1 })).toEqual([]);
    expect(await searchPlaces("Vienna", { fetcher: answer(data) })).toHaveLength(1);
    expect(await searchPlaces(" ", { fetcher: answer(data) })).toEqual([]);
  });

  it("searches in two languages, merges the places, and puts large places first", async () => {
    // The German search finds Vienna by "Wien". The English search finds only small places.
    const answers: Record<string, unknown> = {
      de: {
        results: [
          {
            name: "Wien",
            latitude: 48.2085,
            longitude: 16.3721,
            country: "Österreich",
            population: 1691468,
          },
          { name: "Wien", latitude: 38.0, longitude: -91.6, country: "Vereinigte Staaten" },
        ],
      },
      en: {
        results: [
          { name: "Wien", latitude: 38.0, longitude: -91.6, country: "United States" },
          {
            name: "Wiene",
            latitude: 52.3,
            longitude: 6.6,
            country: "The Netherlands",
            population: 520,
          },
        ],
      },
    };
    const languages: string[] = [];
    const fetcher = async (url: string | URL | Request) => {
      const language = new URL(String(url)).searchParams.get("language")!;
      languages.push(language);
      return new Response(JSON.stringify(answers[language]));
    };
    const places = await searchPlaces("Wien", { fetcher, languages: ["de", "en"] });
    expect(languages.sort()).toEqual(["de", "en"]);
    expect(places.map((p) => p.label)).toEqual([
      "Wien, Österreich",
      "Wiene, The Netherlands",
      "Wien, Vereinigte Staaten",
    ]);
  });

  it("chooses the last ten complete years in the archive", () => {
    expect(climateYears(new Date("2026-11-07"))).toEqual({ firstYear: 2016, lastYear: 2025 });
    // Early in January, the last days of the year before are not in the archive yet.
    expect(climateYears(new Date("2027-01-03"))).toEqual({ firstYear: 2016, lastYear: 2025 });
    expect(climateYears(new Date("2027-01-20"))).toEqual({ firstYear: 2017, lastYear: 2026 });
    const url = new URL(archiveUrl(48.2, 16.37, { firstYear: 2016, lastYear: 2025 }));
    expect(url.searchParams.get("start_date")).toBe("2016-01-01");
    expect(url.searchParams.get("end_date")).toBe("2025-12-31");
    expect(url.searchParams.get("hourly")).toBe(
      "temperature_2m,shortwave_radiation,direct_normal_irradiance,diffuse_radiation",
    );
    expect(url.searchParams.get("timezone")).toBe("UTC");
  });

  it("reads the hourly data of the archive API", () => {
    const hourly = hourlyFromAnswer(archive);
    expect(hourly.time).toHaveLength(48);
    expect(hourly.time[0]).toBe("2023-01-01T00:00");
    expect(hourly.temperature[0]).toBe(1.6);
    expect(Math.max(...hourly.ghi.map((v) => v ?? 0))).toBeGreaterThan(0);
    expect(() => hourlyFromAnswer({ hourly: { time: ["x"] } })).toThrow(/cannot read/);
    expect(() => hourlyFromAnswer("text")).toThrow(/cannot read/);
  });

  it("gives clear errors for the network, a rate limit, a bad request, and a bad answer", async () => {
    const offline = async () => {
      throw new TypeError("Failed to fetch");
    };
    await expect(downloadClimate(48.2, 16.37, { fetcher: offline })).rejects.toThrow(
      /cannot reach open-meteo.com/,
    );
    await expect(
      downloadClimate(48.2, 16.37, { fetcher: answer({ reason: "Too many" }, 429) }),
    ).rejects.toThrow(/too many requests/);
    await expect(
      downloadClimate(48.2, 16.37, { fetcher: answer({ error: true, reason: "Bad date" }, 400) }),
    ).rejects.toThrow(/error 400: Bad date/);
    await expect(
      downloadClimate(48.2, 16.37, {
        fetcher: async () => new Response("<html>", { status: 502 }),
      }),
    ).rejects.toThrow(/error 502/);
    await expect(downloadClimate(48.2, 16.37, { fetcher: answer({ hourly: {} }) })).rejects.toThrow(
      /cannot read/,
    );
    // Two days are not a whole year.
    await expect(downloadClimate(48.2, 16.37, { fetcher: answer(archive) })).rejects.toThrow(
      /incomplete/,
    );
    await expect(downloadClimate(91, 0, { fetcher: answer(archive) })).rejects.toThrow(/latitude/);
  });

  it("makes a climate from an answer of whole years", async () => {
    // A synthetic answer: the two days of the fixture repeat over one year.
    const source = hourlyFromAnswer(archive);
    const time: string[] = [];
    for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2026, 0, 1); t += 3600000) {
      time.push(new Date(t).toISOString().slice(0, 16));
    }
    const pick = (values: (number | null)[]) => time.map((_, i) => values[i % 48]);
    const data = {
      hourly: {
        time,
        temperature_2m: pick(source.temperature),
        shortwave_radiation: pick(source.ghi),
        direct_normal_irradiance: pick(source.dni),
        diffuse_radiation: pick(source.dhi),
      },
    };
    let asked = "";
    const result = await downloadClimate(48.2, 16.37, {
      today: new Date("2026-11-07T10:00:00Z"),
      fetcher: async (url) => {
        asked = url;
        return new Response(JSON.stringify(data));
      },
    });
    expect(asked).toContain("latitude=48.2000");
    expect(result).toMatchObject({
      latitude: 48.2,
      longitude: 16.37,
      firstYear: 2016,
      lastYear: 2025,
      downloaded: "2026-11-07",
    });
    expect(decodeSeries("temperature", result.temperature)[0]).toBeCloseTo(1.6);
    const direct = climateFromData(hourlyFromAnswer(data), { ...result });
    expect(direct.ghi).toBe(result.ghi);
  });
});
