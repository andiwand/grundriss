import { icon } from "../icons";
import { t } from "../i18n";
import {
  ATTRIBUTION,
  ATTRIBUTION_URL,
  CLIMATE_YEARS,
  downloadClimate,
  searchPlaces,
  type Place,
} from "../io/climate";
import { energyBalance } from "../model/balance";
import { findStory } from "../model/building";
import { climateSummary, DEGREE_DAY_BASE, DEGREE_DAY_LIMIT } from "../model/climate";
import { buildingHeatLoss, effectiveAirChange, LEAK_FACTOR, uValue } from "../model/energy";
import { fmt } from "../model/format";
import {
  defaultHeating,
  HEATING_KINDS,
  heatingEnergy,
  HOT_WATER_LOSS,
  INTERNAL_GAINS,
} from "../model/heating";
import { summerOverheating } from "../model/overheating";
import { faceInfo, pvSummary, specificYield } from "../model/pv";
import { designFlow, FAIR_FLOW, GOOD_FLOW, roomReadiness } from "../model/radiators";
import { storyBox } from "../model/roof";
import type { Envelope, Location as PlanLocation, Point } from "../model/types";
import { cached, doc, editor, panel, shell } from "./context";
import {
  badge,
  button,
  checkField,
  compassName,
  euro,
  field,
  group,
  heading,
  kwh,
  layerEditor,
  MONTH_NAMES,
  monthChart,
  numberField,
  paragraph,
  section,
  selectField,
  setColumn,
  stats,
  table,
  textField,
} from "./panel";
import { renderPanel } from "./selection";

/** The location and the climate, the envelope, the heating per year, and the PV yield. */
export function renderEnergyTopic(): void {
  // The wide panel of the energy has two columns when it has room: the inputs and the results.
  const columns = document.createElement("div");
  columns.className = "panel-columns";
  const inputs = document.createElement("div");
  const results = document.createElement("div");
  inputs.className = results.className = "panel-column";
  columns.append(inputs, results);
  panel.append(columns);
  setColumn(inputs);
  renderLocationPanel();
  renderEnvelopeInputs();
  renderHeatingInputs();
  renderElectricityInputs();
  setColumn(results);
  renderHeatLoss();
  renderHeatingResults();
  renderReadiness();
  renderSummer();
  renderBalance();
  const building = doc.building;
  if (building.pv.length > 0) {
    const total = cached("pv", () => pvSummary(doc.building));
    heading(t("Photovoltaic"), "sparkle");
    stats([
      [`${fmt(total.peak, 1)} kWp`, t("{count} panels", { count: total.count })],
      [kwh(total.yield), t("per year")],
    ]);
    pvSourceNote();
    button(t("Change the PV fields"), () => shell.setTopic("utilities"), { icon: "bolt" });
  }
  setColumn(panel);
}

/**
 * Clears the state of the location group, and stops a download of the climate, for example when
 * another plan opens.
 */
export function resetLocation(): void {
  climateRequest?.abort();
  climateRequest = null;
  locationOpen = null;
  placeQuery = "";
  locationBusy = null;
  locationMessage = null;
}

/** True or false after the user opens or closes the place group, null before. */
let locationOpen: boolean | null = null;

let placeQuery = "";

/** The text of the request that runs, or null. */
let locationBusy: string | null = null;

let locationMessage: { text: string; error: boolean } | null = null;

let climateRequest: AbortController | null = null;

/** A field for a latitude or a longitude in degrees. An empty field shows no value. */
function coordinateField(
  text: string,
  value: number | null,
  limit: number,
  change: (value: number) => void,
): void {
  const input = document.createElement("input");
  input.type = "number";
  input.step = "0.0001";
  input.min = String(-limit);
  input.max = String(limit);
  input.value = value === null ? "" : String(Math.round(value * 10000) / 10000);
  input.addEventListener("change", () => {
    const parsed = Number(input.value);
    if (input.value !== "" && Number.isFinite(parsed) && Math.abs(parsed) <= limit) change(parsed);
  });
  field(text, input, "°");
}

/** The center of the walls of the active story, or the origin. A new location is there. */
function planCenter(): Point {
  const box = storyBox(doc.plan);
  return box ? { x: (box[0].x + box[2].x) / 2, y: (box[0].y + box[2].y) / 2 } : { x: 0, y: 0 };
}

/** Changes the location of the building. A building without a location gets one. */
function editLocation(edit: (location: PlanLocation) => void) {
  doc.editBuilding((b) => {
    b.location ??= { name: "", latitude: 0, longitude: 0, ...planCenter() };
    edit(b.location);
  });
}

/** The pause after the last key before the search asks for places, in ms. */
const SEARCH_DELAY = 350;
/** The search starts at this number of letters. */
const SEARCH_MIN = 3;

/**
 * The search of the place: a wide field that lists places while the user types. The arrow keys
 * move in the list, Enter takes a place, and Esc closes the list. Each search sends the typed
 * text to open-meteo.com, after a short pause and from three letters on. The field keeps its
 * state in the DOM, so typing does not draw the panel again.
 */
function placeSearch(): HTMLElement {
  const box = document.createElement("div");
  box.className = "place-search";
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = t("Search a town or a village");
  input.setAttribute("aria-label", t("Search a town or a village"));
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.autocomplete = "off";
  input.value = placeQuery;
  const list = document.createElement("ul");
  list.className = "place-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  const status = document.createElement("div");
  status.className = "place-status";
  box.innerHTML = icon("search");
  box.append(input, list, status);

  let places: Place[] = [];
  let active = -1;
  let timer = 0;
  let request: AbortController | null = null;

  const show = (items: Place[], message = "") => {
    places = items;
    active = items.length > 0 ? 0 : -1;
    list.replaceChildren(
      ...items.map((place, i) => {
        const item = document.createElement("li");
        item.setAttribute("role", "option");
        const name = document.createElement("strong");
        name.textContent = place.name;
        const rest = document.createElement("span");
        rest.textContent = place.label.startsWith(place.name)
          ? place.label.slice(place.name.length).replace(/^,\s*/, "")
          : place.label;
        item.append(name, rest);
        // The pointer down, not the click: the field loses its focus before a click.
        item.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          choose(i);
        });
        return item;
      }),
    );
    list.hidden = items.length === 0;
    input.setAttribute("aria-expanded", String(!list.hidden));
    status.textContent = message;
    mark();
  };
  const mark = () =>
    [...list.children].forEach((item, i) => item.classList.toggle("active", i === active));
  const choose = (i: number) => {
    const place = places[i];
    if (!place) return;
    request?.abort();
    placeQuery = "";
    show([]);
    locationMessage = null;
    editLocation((l) => {
      l.name = place.label;
      l.latitude = place.latitude;
      l.longitude = place.longitude;
    });
  };
  const search = async (query: string) => {
    request?.abort();
    const controller = new AbortController();
    request = controller;
    status.textContent = t("Searching the place…");
    try {
      const found = await searchPlaces(query, { signal: controller.signal });
      if (request !== controller) return;
      show(found, found.length === 0 ? t('Found no place for "{query}".', { query }) : "");
    } catch (error) {
      if (controller.signal.aborted) return;
      show([], t((error as Error).message));
    }
  };
  input.addEventListener("input", () => {
    placeQuery = input.value;
    window.clearTimeout(timer);
    const query = input.value.trim();
    if (query.length < SEARCH_MIN) {
      request?.abort();
      show([]);
      return;
    }
    timer = window.setTimeout(() => void search(query), SEARCH_DELAY);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (places.length === 0) return;
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + places.length) % places.length;
      mark();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0) choose(active);
      else if (input.value.trim().length >= SEARCH_MIN) void search(input.value.trim());
    } else if (e.key === "Escape" && !list.hidden) {
      e.stopPropagation();
      show([]);
    }
  });
  input.addEventListener("blur", () => (list.hidden = true));
  input.addEventListener("focus", () => (list.hidden = places.length === 0));
  return box;
}

/**
 * Downloads the climate of the location and stores it in the building. This sends the
 * coordinates to open-meteo.com. If the location changes during the download, the result goes
 * away.
 */
async function loadClimate(): Promise<void> {
  const location = doc.building.location;
  if (!location || locationBusy) return;
  const { latitude, longitude } = location;
  const request = new AbortController();
  climateRequest = request;
  locationBusy = t("Loading {years} years of weather data from open-meteo.com…", {
    years: CLIMATE_YEARS,
  });
  locationMessage = null;
  renderPanel();
  try {
    const climate = await downloadClimate(latitude, longitude, {
      signal: request.signal,
    });
    // Another plan opened during the download (`resetLocation`): its result goes away.
    if (request !== climateRequest) return;
    const now = doc.building.location;
    if (now?.latitude !== latitude || now.longitude !== longitude) {
      locationMessage = {
        text: t("The location changed during the download. Load the climate again."),
        error: true,
      };
    } else {
      doc.editBuilding((b) => (b.climate = climate));
      locationMessage = {
        text: t("Loaded the climate. The plan stores it, so the app needs no network for it now."),
        error: false,
      };
    }
  } catch (error) {
    if (request !== climateRequest) return;
    locationMessage = request.signal.aborted
      ? { text: t("Stopped the download."), error: false }
      : { text: t((error as Error).message), error: true };
  } finally {
    if (request === climateRequest) {
      locationBusy = null;
      climateRequest = null;
      renderPanel();
    }
  }
}

/** The location: the place search, the coordinates, the map under the plan, and the climate. */
function renderLocationPanel(): void {
  const building = doc.building;
  const location = building.location;
  heading(t("Location"), "pin");
  const title = location?.name
    ? t("Place · {name}", { name: location.name })
    : location
      ? t("Place · {name}", { name: `${fmt(location.latitude)}, ${fmt(location.longitude)}` })
      : t("Place");
  // The search is the way to the place; the group below has the exact values and the map.
  section.append(placeSearch());
  group(title, locationOpen ?? false, () => {
    if (location) {
      textField(t("Name"), location.name, (value) => editLocation((l) => (l.name = value)), {
        allowEmpty: true,
      });
    }
    coordinateField(t("Latitude"), location?.latitude ?? null, 90, (value) =>
      editLocation((l) => (l.latitude = value)),
    );
    coordinateField(t("Longitude"), location?.longitude ?? null, 180, (value) =>
      editLocation((l) => (l.longitude = value)),
    );
    if (location) {
      const moving = editor.tool === "map";
      button(
        moving ? t("Done") : t("Move the map"),
        () => {
          if (moving) return shell.setTool("select");
          // Without a map, the map of OpenStreetMap shows, so that there is something to move.
          if (!editor.mapSource) shell.setMapSource("osm");
          shell.setTool("map");
        },
        { icon: moving ? "check" : "hand", kind: moving ? "primary" : undefined },
      );
      // The point of the plan at the place: the map in the Layers menu lies under it.
      const limit = { min: -10000, step: 0.1 };
      numberField(t("Plan point x"), location.x, (v) => editLocation((l) => (l.x = v)), limit);
      numberField(t("Plan point y"), location.y, (v) => editLocation((l) => (l.y = v)), limit);
      paragraph(
        t(
          "The plan point is at the latitude and the longitude. Move the map, or change the plan point and North, until the map fits the plan.",
        ),
        "note",
      );
    }
  });
  const details = section.lastElementChild as HTMLDetailsElement;
  details.addEventListener("toggle", () => (locationOpen = details.open));
  if (locationBusy) {
    paragraph(locationBusy, "busy");
    if (climateRequest) button(t("Stop"), () => climateRequest?.abort(), { icon: "close" });
  } else if (location) {
    button(
      building.climate ? t("Load the climate again") : t("Load climate"),
      () => void loadClimate(),
      { kind: "primary" },
    );
  }
  paragraph(
    t(
      "The search sends what you type to open-meteo.com, and Load climate sends the place. The plan stores the climate, so it works offline after that.",
    ),
    "note",
  );
  if (locationMessage) {
    paragraph(locationMessage.text, locationMessage.error ? "warning" : "note");
  }
  if (building.climate) renderClimateSummary();
}

/** The values of the stored climate, and the credit of the data. */
function renderClimateSummary(): void {
  const building = doc.building;
  const climate = building.climate!;
  const summary = climateSummary(climate);
  const location = building.location;
  if (
    location &&
    (Math.abs(location.latitude - climate.latitude) > 0.01 ||
      Math.abs(location.longitude - climate.longitude) > 0.01)
  ) {
    paragraph(
      t("The climate is for {place}. Load it again for the new location.", {
        place: `${fmt(climate.latitude)}, ${fmt(climate.longitude)}`,
      }),
      "warning",
    );
  }
  // The best roof face of the building, else the best tilt toward the equator.
  const faces = faceInfo(building).map((f) => ({
    ...f,
    perKwp: specificYield(building, f.tilt, f.azimuth),
  }));
  const best = faces.sort((p, q) => q.perKwp - p.perKwp)[0];
  stats([
    [`${fmt(summary.meanTemperature, 1)} °C`, t("mean temperature")],
    [`${fmt(summary.designTemperature, 1)} °C`, t("design temperature")],
    [
      `${fmt(summary.degreeDays, 0)} K·d`,
      t("degree days {base}/{limit}", { base: DEGREE_DAY_BASE, limit: DEGREE_DAY_LIMIT }),
    ],
    [`${fmt(summary.globalIrradiation, 0)} kWh/m²`, t("sun on the ground per year")],
    best
      ? [
          `${fmt(best.perKwp, 0)} kWh/kWp`,
          t("PV on the best roof face ({direction} {tilt}°)", {
            direction: compassName(best.azimuth),
            tilt: Math.round(best.tilt),
          }),
          true,
        ]
      : [
          `${fmt(summary.optimum.yield, 0)} kWh/kWp`,
          t("PV at the best tilt ({direction} {tilt}°)", {
            direction: compassName(summary.optimum.azimuth),
            tilt: summary.optimum.tilt,
          }),
          true,
        ],
  ]);
  const months = MONTH_NAMES.map((name) => name.slice(0, 3));
  const years = { first: climate.firstYear, last: climate.lastYear };
  group(t("Climate {first} to {last}", years), false, () => {
    for (let i = 0; i < 12; i += 3) {
      paragraph(
        summary.monthly
          .slice(i, i + 3)
          .map((temperature, j) => `${months[i + j]} ${fmt(temperature, 1)} °C`)
          .join(" · "),
      );
    }
    paragraph(
      t(
        "A typical year: the mean of each hour of {first} to {last}, loaded on {date}. The design temperature is the coldest mean of 48 hours in these years. The degree days count the days below {limit} °C against {base} °C inside.",
        { ...years, date: climate.downloaded, limit: DEGREE_DAY_LIMIT, base: DEGREE_DAY_BASE },
      ),
      "note",
    );
    button(t("Remove the climate"), () => doc.editBuilding((b) => (b.climate = null)), {
      kind: "danger",
      icon: "trash",
    });
  });
  const credit = document.createElement("p");
  credit.className = "note";
  const link = document.createElement("a");
  link.href = ATTRIBUTION_URL;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = ATTRIBUTION;
  credit.append(link, " (CC BY 4.0).");
  section.append(credit);
}

/** A button that puts the design temperature of the location into the envelope. */
function designTemperatureButton(): void {
  const climate = doc.building.climate;
  if (!climate) return;
  const value = climate.designTemperature;
  if (doc.building.envelope.outside === value) {
    paragraph(t("Outside is the design temperature of the location."), "note");
    return;
  }
  button(t("Use {value} °C of the location", { value: fmt(value, 1) }), () =>
    doc.editBuilding((b) => (b.envelope.outside = value)),
  );
}

/** Says where the PV yield comes from. */
export function pvSourceNote(): void {
  paragraph(
    doc.building.climate
      ? t("The yield comes from the climate of the location, without shade.")
      : t(
          "The yield is a general estimate for Central Europe. Load the climate of the location for a better value.",
        ),
    "note",
  );
}

/** The heat loss of the building at the design temperature. */
function renderHeatLoss(): void {
  const envelope = doc.building.envelope;
  const summary = cached("loss", () => buildingHeatLoss(doc.building));
  heading(t("Heat loss"), "flame");
  const perGross = summary.grossArea > 0 ? summary.total / summary.grossArea : summary.perArea;
  stats([
    [`${fmt(summary.total / 1000, 1)} kW`, t("heat loss")],
    [`${fmt(perGross, 0)} W/m²`, t("per gross floor area")],
    [`${fmt(summary.grossArea, 0)} m²`, t("gross floor area (BGF)")],
    [`${fmt(summary.netArea, 0)} m²`, t("net floor area")],
  ]);
  paragraph(
    t(
      "At {outside} °C outside and {inside} °C inside. An estimate, not a calculation by a standard. Click a room or a wall on the plan for its own values.",
      { outside: fmt(envelope.outside, 1), inside: fmt(envelope.inside, 1) },
    ),
    "note",
  );
}

/** The layers of the envelope, the U-values of the openings, and the temperatures. */
function renderEnvelopeInputs(): void {
  const envelope = doc.building.envelope;
  heading(t("Envelope"), "layers");
  const editEnvelope = (edit: (envelope: Envelope) => void) =>
    doc.editBuilding((b) => edit(b.envelope));
  group(`${t("Outer walls")} · U ${fmt(uValue(envelope.wall, "wall"))}`, false, () =>
    layerEditor(envelope.wall, "wall", (change) => editEnvelope((e) => change(e.wall))),
  );
  group(`${t("Roof")} · U ${fmt(uValue(envelope.roof, "roof"))}`, false, () =>
    layerEditor(envelope.roof, "roof", (change) => editEnvelope((e) => change(e.roof))),
  );
  group(`${t("Floor on the ground")} · U ${fmt(uValue(envelope.floor, "floor"))}`, false, () =>
    layerEditor(envelope.floor, "floor", (change) => editEnvelope((e) => change(e.floor))),
  );
  group(
    `${t("Slab to an unheated story")} · U ${fmt(uValue(envelope.ceiling, "floor"))}`,
    false,
    () =>
      layerEditor(envelope.ceiling, "floor", (change) => editEnvelope((e) => change(e.ceiling))),
  );
  const stories = doc.building.stories;
  const heated = stories.filter((s) => s.heated).length;
  group(t("Heated stories · {heated} of {count}", { heated, count: stories.length }), false, () => {
    for (const story of [...stories].reverse()) {
      checkField(t(story.name), story.heated, (value) =>
        doc.editBuilding((b) => (findStory(b, story.id)!.heated = value)),
      );
    }
    paragraph(
      t(
        "An unheated story, for example a cold cellar or attic, loses no heat. The heated rooms next to it lose heat through the slab between them.",
      ),
      "note",
    );
  });
  group(`${t("Thermal bridges and air")} · ${fmt(envelope.thermalBridge)} W/m²K`, false, () => {
    numberField(
      t("Thermal bridges ΔU"),
      envelope.thermalBridge,
      (v) => editEnvelope((e) => (e.thermalBridge = v)),
      { step: 0.01, unit: "W/m²K" },
    );
    const air = envelope.ventilation;
    const setAir = (key: keyof typeof air) => (value: number) =>
      editEnvelope((e) => (e.ventilation[key] = value));
    numberField(t("Air change"), air.airChange, setAir("airChange"), { step: 0.05, unit: "1/h" });
    numberField(t("Airtightness n50"), air.n50, setAir("n50"), { step: 0.1, unit: "1/h" });
    numberField(
      t("Heat recovery"),
      Math.round(air.heatRecovery * 100),
      (v) => setAir("heatRecovery")(Math.min(95, v) / 100),
      { step: 5, unit: "%" },
    );
    paragraph(
      t(
        "The thermal bridges add ΔU on all areas of the envelope: {careless} without a check, {careful} for a careful design, 0 for a design without bridges. A ventilation system with heat recovery takes back its part of the heat of the air, but the leaks (n50 × {leak}) add. The air that loses heat: {air} per hour.",
        {
          careless: fmt(0.1),
          careful: fmt(0.05),
          leak: fmt(LEAK_FACTOR),
          air: fmt(effectiveAirChange(envelope)),
        },
      ),
      "note",
    );
  });
  group(t("Windows, doors, and climate"), false, () => {
    const set = (key: "windowU" | "doorU" | "outside" | "inside") => (value: number) =>
      editEnvelope((e) => (e[key] = value));
    numberField(t("Window U"), envelope.windowU, set("windowU"), { min: 0.1, step: 0.1, unit: "" });
    numberField(t("Door U"), envelope.doorU, set("doorU"), { min: 0.1, step: 0.1, unit: "" });
    numberField(t("Outside"), envelope.outside, set("outside"), { min: -60, step: 1, unit: "°C" });
    numberField(t("Inside"), envelope.inside, set("inside"), { min: -60, step: 0.5, unit: "°C" });
    designTemperatureButton();
  });
}

/** The heat source of the building and its efficiency, in the topic of the utilities. */
export function renderHeatingSystem(): void {
  const heating = doc.building.envelope.heating;
  const setHeating = (edit: (h: typeof heating) => void) =>
    doc.editBuilding((b) => edit(b.envelope.heating));
  selectField(
    t("Heating"),
    heating.kind,
    Object.entries(HEATING_KINDS).map(([kind, k]) => [kind as typeof heating.kind, t(k.name)]),
    (kind) => doc.editBuilding((b) => (b.envelope.heating = defaultHeating(kind))),
  );
  const pump = heating.kind === "heat-pump";
  if (!pump) {
    numberField(
      t("Efficiency"),
      heating.efficiency,
      (value) => value > 0 && setHeating((h) => (h.efficiency = value)),
      { min: 0.1, step: 0.01, unit: "" },
    );
    return;
  }
  selectField(
    t("Source"),
    heating.source,
    [
      ["air", t("Outside air")],
      ["ground", t("Ground")],
    ],
    (source) => setHeating((h) => (h.source = source)),
  );
  selectField(
    t("Flow temperature"),
    heating.flow === null ? "rooms" : "set",
    [
      ["rooms", t("From the radiators")],
      ["set", t("Fixed")],
    ],
    (value) => setHeating((h) => (h.flow = value === "rooms" ? null : 45)),
  );
  if (heating.flow !== null) {
    numberField(t("Design flow"), heating.flow, (v) => setHeating((h) => (h.flow = v)), {
      min: 25,
      step: 1,
      unit: "°C",
    });
  }
  checkField(t("Fixed performance factor"), heating.fixedEfficiency, (value) =>
    setHeating((h) => (h.fixedEfficiency = value)),
  );
  if (heating.fixedEfficiency) {
    numberField(
      t("Performance factor"),
      heating.efficiency,
      (value) => value > 0 && setHeating((h) => (h.efficiency = value)),
      { min: 0.1, step: 0.1, unit: "" },
    );
  }
  const energy = cached("heating", () => heatingEnergy(doc.building));
  if (energy?.spf != null) {
    const values = { spf: fmt(energy.spf, 1), flow: String(energy.flow ?? "") };
    const text =
      energy.flowSource === "radiators"
        ? t(
            "The heat pump has a seasonal performance factor of about {spf}, at the design flow that the radiators need ({flow} °C). Each hour has its own performance from the flow and the source temperature.",
            values,
          )
        : energy.flowSource === "set"
          ? t(
              "The heat pump has a seasonal performance factor of about {spf}, at the design flow that you set ({flow} °C). Each hour has its own performance from the flow and the source temperature.",
              values,
            )
          : t(
              "The heat pump has a seasonal performance factor of about {spf}, at the design flow of 45 °C, because no room has a radiator with a power ({flow} °C). Each hour has its own performance from the flow and the source temperature.",
              values,
            );
    paragraph(
      heating.fixedEfficiency
        ? t("The heat pump has the fixed factor {factor}.", { factor: fmt(heating.efficiency) })
        : text,
      "note",
    );
  }
}

/** The heat source of the building, from Utilities, and the price of its energy. */
function renderHeatingInputs(): void {
  const heating = doc.building.envelope.heating;
  const info = HEATING_KINDS[heating.kind];
  heading(t("Heating"), "flame");
  const setHeating = (edit: (h: typeof heating) => void) =>
    doc.editBuilding((b) => edit(b.envelope.heating));
  const pump = heating.kind === "heat-pump";
  const detail = pump
    ? heating.fixedEfficiency
      ? t("Performance factor {value}", { value: fmt(heating.efficiency) })
      : heating.source === "ground"
        ? t("Ground source, calculated performance")
        : t("Air source, calculated performance")
    : t("Efficiency {value}", { value: fmt(heating.efficiency) });
  button(t(info.name), () => shell.setTopic("utilities"), {
    icon: "flame",
    detail: t("{detail} · change it in Utilities", { detail }),
  });
  if (info.energy === "electricity") {
    paragraph(t("The heating uses the price of electricity of the Electricity group."), "note");
  } else {
    numberField(
      t("Price of {energy}", { energy: t(info.energy) }),
      heating.price,
      (v) => setHeating((h) => (h.price = v)),
      { step: 0.01, unit: "€/kWh" },
    );
  }

  const water = doc.building.envelope.hotWater;
  heading(t("Hot water"), "drop");
  const setWater = (edit: (w: typeof water) => void) =>
    doc.editBuilding((b) => edit(b.envelope.hotWater));
  numberField(t("People"), water.people, (v) => setWater((w) => (w.people = Math.round(v))), {
    step: 1,
    unit: "",
  });
  numberField(t("Per person and day"), water.liters, (v) => setWater((w) => (w.liters = v)), {
    step: 5,
    unit: "l",
  });
  selectField(
    t("Heater"),
    water.heater,
    [
      ["heating", t(info.name)],
      ["electric", t("Direct electric")],
    ],
    (heater) => setWater((w) => (w.heater = heater)),
  );
  paragraph(
    t(
      "Water from 10 °C to 55 °C, and {loss} % more for the losses of the storage and the pipes. 0 people leaves the hot water out.",
      { loss: Math.round(HOT_WATER_LOSS * 100) },
    ),
    "note",
  );
}

/** The energy for heating per year: the demand, the cost, the CO₂, the class, and the months. */
function renderHeatingResults(): void {
  const building = doc.building;
  const info = HEATING_KINDS[building.envelope.heating.kind];
  heading(t("Heating per year"), "gauge");
  const energy = cached("heating", () => heatingEnergy(doc.building));
  if (!energy) {
    paragraph(
      building.climate
        ? t("Draw rooms to calculate the energy per year.")
        : t("Load the climate in the Location group to calculate the energy per year."),
      "note",
    );
    return;
  }
  const tiles: [string, string, boolean?][] = [
    [kwh(energy.demand), t("heat demand per year")],
    [`${fmt(energy.perArea, 0)} kWh/m²`, t("per gross floor area")],
    [energy.efficiencyClass, t("class (an estimate, not a certificate)")],
    [kwh(energy.final), t("{energy} for the heating", { energy: t(info.energy) })],
  ];
  if (energy.hotWaterFinal > 0) {
    const water = energy.hotWaterElectric ? "electricity" : info.energy;
    tiles.push([kwh(energy.hotWaterFinal), t("{energy} for the hot water", { energy: t(water) })]);
  }
  tiles.push(
    [euro(energy.cost), t("per year")],
    [`${fmt(energy.co2 / 1000, 1)} t`, t("CO₂ per year")],
  );
  if (energy.electric > 0 && energy.pvCovered > 0) {
    const share = Math.round((energy.pvCovered / energy.electric) * 100);
    tiles.push([
      `${share} %`,
      t("of the electricity from your PV, in the balance of each month"),
      true,
    ]);
  }
  if (energy.spf != null) tiles.push([fmt(energy.spf, 1), t("seasonal performance factor")]);
  stats(tiles);
  monthChart(energy.months.map((m) => m.demand));
  paragraph(
    t(
      "A monthly balance in the spirit of EN ISO 13790, with the stored climate: the heat loss of the heated rooms, the sun through the windows, and {gains} W/m² from people and devices. The cost and the CO₂ include the hot water. The energy per m² uses the gross floor area. The class uses the heat demand on the scale of the Austrian energy certificate (OIB), but it is an estimate, not a certificate: the certificate uses a reference climate and more details. The PV share is an upper limit, because PV in the day does not heat at night without a battery.",
      { gains: fmt(INTERNAL_GAINS) },
    ),
    "note",
  );
}

/** The electricity of the household, the battery, and the prices of electricity. */
function renderElectricityInputs(): void {
  const household = doc.building.household;
  heading(t("Household electricity"), "bolt");
  const set = (key: keyof typeof household) => (value: number) =>
    doc.editBuilding((b) => (b.household[key] = value));
  numberField(t("Household per year"), household.electricity, set("electricity"), {
    step: 100,
    unit: "kWh",
  });
  numberField(t("Battery"), household.battery, set("battery"), { step: 1, unit: "kWh" });
  numberField(t("Price from the grid"), household.price, set("price"), {
    step: 0.01,
    unit: "€/kWh",
  });
  numberField(t("Payment for feed-in"), household.feedIn, set("feedIn"), {
    step: 0.01,
    unit: "€/kWh",
  });
  paragraph(
    t(
      "The household electricity is without the heating and the hot water. The price from the grid is also the price of an electric heating.",
    ),
    "note",
  );
}

/** The hourly balance of electricity: PV, self-consumption, the grid, and the energy cost. */
function renderBalance(): void {
  const balance = cached("balance", () => energyBalance(doc.building));
  heading(t("Electricity per year"), "bolt");
  if (!balance) {
    paragraph(t("Load the climate in the Location group for the hourly balance."), "note");
    return;
  }
  const percent = (value: number) => `${Math.round(value * 100)} %`;
  const tiles: [string, string, boolean?][] = [
    [kwh(balance.load), t("electricity of the building")],
    [kwh(balance.imported), t("from the grid")],
  ];
  if (balance.pv > 0) {
    tiles.push(
      [kwh(balance.pv), t("PV yield")],
      [kwh(balance.exported), t("to the grid")],
      [percent(balance.selfConsumption), t("of the PV used in the building")],
      [percent(balance.selfSufficiency), t("of the electricity from the PV")],
    );
  }
  tiles.push([euro(balance.cost), t("energy cost per year"), true]);
  stats(tiles);
  const parts = [
    t("household {value}", { value: kwh(balance.household) }),
    balance.heating > 0 ? t("heating {value}", { value: kwh(balance.heating) }) : "",
    balance.hotWater > 0 ? t("hot water {value}", { value: kwh(balance.hotWater) }) : "",
    balance.fromBattery > 0
      ? t("from the battery {value}", { value: kwh(balance.fromBattery) })
      : "",
  ].filter(Boolean);
  paragraph(
    t(
      "{parts}. An hourly balance of the typical year: the PV of each hour against a usual day of a household, the heating by the temperature of the hour, and the hot water from 6:00 to 22:00. The energy cost is the electricity from the grid, minus the feed-in, plus the fuel of a heating without electricity.",
      { parts: parts.join(" · ") },
    ),
    "note",
  );
  button(t("Compare renovations"), () => shell.setTopic("renovation"), { icon: "coins" });
}

/** The name of a room in a table: its name, or "Room" with its story. */
const roomLabel = (name: string, storyId: string) => {
  const story = doc.building.stories.find((st) => st.id === storyId);
  return `${name || t("Room")}${doc.building.stories.length > 1 && story ? ` · ${t(story.name)}` : ""}`;
};

/** The heat pump readiness of the rooms: the flow temperature that each room needs. */
function renderReadiness(): void {
  const rooms = cached("readiness", () => roomReadiness(doc.building));
  if (rooms.length === 0) return;
  heading(t("Heat pump readiness"), "flame");
  const flow = designFlow(rooms);
  const heated = rooms.filter((r) => r.readiness !== "none");
  if (heated.length === 0) {
    paragraph(
      t(
        "No room has a radiator with a power or floor heating. Add the radiators in Utilities with their power at 75/65/20 °C, or mark the floor heating of the rooms.",
      ),
      "note",
    );
    return;
  }
  const tone = (r: (typeof rooms)[number]) =>
    r.readiness === "good"
      ? "good"
      : r.readiness === "fair"
        ? "fair"
        : r.readiness === "poor"
          ? "bad"
          : "none";
  const words = { good: t("good"), fair: t("fair"), poor: t("too small"), none: t("no heating") };
  stats([
    [flow === null ? "–" : `${flow} °C`, t("flow that the house needs"), true],
    [
      t("{ready} of {count}", {
        ready: heated.filter((r) => r.readiness === "good").length,
        count: heated.length,
      }),
      t("rooms ready at {flow} °C", { flow: GOOD_FLOW }),
    ],
  ]);
  table(
    [t("Room"), t("Loss"), t("At 45 °C"), t("Needs"), ""],
    rooms.map((r) => [
      roomLabel(r.name, r.storyId),
      `${Math.round(r.loss)} W`,
      r.readiness === "none" ? "–" : `${Math.round(r.at45)} W`,
      r.flow === null ? "–" : `${r.flow} °C`,
      badge(words[r.readiness], tone(r)),
    ]),
    ["left", "right", "right", "right", "left"],
  );
  paragraph(
    t(
      "A heat pump works well up to a flow of {good} °C, and acceptably up to {fair} °C. A room that needs more gets a larger radiator, or the house gets more insulation. The power of a radiator is its power at 75/65/20 °C (EN 442), with the exponent {exponent}.",
      { good: GOOD_FLOW, fair: FAIR_FLOW, exponent: fmt(1.3, 1) },
    ),
    "note",
  );
}

/** True if the summer check counts external blinds on the windows. Not in the plan. */
let summerBlinds = false;

/** The summer check: the hours over 27 °C and the highest temperature of each room. */
function renderSummer(): void {
  heading(t("Summer"), "sparkle");
  const rooms = cached(`summer:${summerBlinds}`, () =>
    summerOverheating(doc.building, { blinds: summerBlinds }),
  );
  if (!rooms) {
    paragraph(t("Load the climate in the Location group for the summer check."), "note");
    return;
  }
  checkField(t("External blinds"), summerBlinds, (value) => {
    summerBlinds = value;
    shell.renderPanel();
  });
  const words = { ok: t("ok"), warning: t("warm"), risk: t("too hot") };
  const tones = { ok: "good", warning: "fair", risk: "bad" } as const;
  table(
    [t("Room"), t("Glass"), "> 27 °C", t("Max"), ""],
    rooms.map((r) => [
      roomLabel(r.name, r.storyId),
      `${Math.round(r.glazingRatio * 100)} %`,
      `${r.hoursOver27} h`,
      `${fmt(r.max, 1)} °C`,
      badge(words[r.verdict], tones[r.verdict]),
    ]),
    ["left", "right", "right", "right", "left"],
  );
  paragraph(
    t(
      "An estimate in the spirit of ÖNORM B 8110-3 and DIN 4108-2, not the procedure of the standard: each room is one node with its mass, the sun through its windows, people and devices, and open windows when the outside is cooler. The verdict uses the degree hours over 27 °C (1200 K·h is the limit for homes). Glass is the area of the windows per floor area.",
    ),
    "note",
  );
}
