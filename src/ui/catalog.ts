// The furniture catalog: a drawer over the 2D editor with four sources. The generic pieces of
// the app, the bundled Kenney kit, Poly Haven (loaded from the internet on demand), and the
// models of the plan with the import of a file. A click on a card gives a template piece to the
// caller, and the caller starts the furniture tool with it.

import { importModelFile } from "../furniture/import";
import { kenneyModel, loadKenneyCatalog, type KenneyItem } from "../furniture/kenney";
import { downloadModel, listFurniture, type PolyHavenItem } from "../furniture/polyhaven";
import { t } from "../i18n";
import { icon } from "../icons";
import {
  CATEGORY_NAMES,
  GENERIC_TYPES,
  furnitureSymbol,
  newFurniture,
  type Category,
} from "../model/furniture";
import type { Building, Furniture, Model } from "../model/types";

type Tab = "generic" | "kenney" | "polyhaven" | "plan";

const TABS: [Tab, string][] = [
  ["generic", "Generic"],
  ["kenney", "Kenney"],
  ["polyhaven", "Poly Haven"],
  ["plan", "Imported"],
];

interface CatalogHost {
  building(): Building;
  /** Adds a model to the building, if the building does not have it. */
  addModel(model: Model): void;
  /** Starts the furniture tool with the piece. */
  place(template: Furniture, model?: Model): void;
  status(text: string, error?: boolean): void;
  /** Tells the host that the catalog opened or closed. */
  toggled(): void;
}

export class Catalog {
  private tab: Tab = "generic";
  private query = "";
  private kenney: KenneyItem[] | null = null;
  private polyHaven: PolyHavenItem[] | null = null;
  private error: string | null = null;
  private busy = new Set<string>();
  /** The tabs with a list that loads now. */
  private loading = new Set<Tab>();

  constructor(
    private readonly element: HTMLElement,
    private readonly host: CatalogHost,
  ) {}

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.element.hidden = false;
    this.host.toggled();
    this.render();
    this.element.querySelector<HTMLInputElement>(".search input")?.focus();
  }

  close(): void {
    this.element.hidden = true;
    this.host.toggled();
  }

  render(): void {
    if (!this.isOpen) return;
    const root = this.element;
    root.replaceChildren();

    const header = document.createElement("header");
    header.append(t("Furniture"));
    const close = document.createElement("button");
    close.className = "icon-button";
    close.title = t("Close (Esc)");
    close.innerHTML = icon("close");
    close.addEventListener("click", () => this.close());
    header.append(close);

    const tabs = document.createElement("div");
    tabs.className = "tabs";
    for (const [tab, name] of TABS) {
      const button = document.createElement("button");
      button.textContent = t(name);
      button.classList.toggle("active", tab === this.tab);
      button.addEventListener("click", () => {
        this.tab = tab;
        this.error = null;
        this.render();
      });
      tabs.append(button);
    }

    const search = document.createElement("label");
    search.className = "search";
    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = t("Search");
    input.value = this.query;
    input.addEventListener("input", () => {
      this.query = input.value;
      this.renderBody(body);
    });
    search.append(input);

    const body = document.createElement("div");
    body.className = "body";
    root.append(header, tabs, search, body);
    this.renderBody(body);
  }

  private renderBody(body: HTMLElement): void {
    body.replaceChildren();
    if (this.tab === "generic") this.renderGeneric(body);
    if (this.tab === "kenney") this.renderKenney(body);
    if (this.tab === "polyhaven") this.renderPolyHaven(body);
    if (this.tab === "plan") this.renderPlan(body);
    if (this.error) note(body, this.error, true);
  }

  private matches(...texts: string[]): boolean {
    const query = this.query.trim().toLowerCase();
    return !query || texts.some((text) => text.toLowerCase().includes(query));
  }

  // ----- The tabs -----

  private renderGeneric(body: HTMLElement): void {
    // The search finds a piece by its name in the language of the app, and in English.
    const shown = GENERIC_TYPES.filter((type) =>
      this.matches(
        t(type.name),
        type.name,
        t(CATEGORY_NAMES[type.category]),
        CATEGORY_NAMES[type.category],
      ),
    );
    bySection(body, shown, (cards, type) => {
      const template = newFurniture({ kind: "generic", type: type.type }, { x: 0, y: 0 });
      card(
        cards,
        t(type.name),
        `${size(type.width)} × ${size(type.depth)}`,
        symbolPicture(template),
        () => this.host.place(template),
      );
    });
  }

  /**
   * Loads the list of a tab once. After an error, the list loads again only when the user opens
   * the tab again, so that a failed request does not repeat without end.
   */
  private loadList<T>(
    tab: Tab,
    body: HTMLElement,
    text: string,
    load: () => Promise<T>,
    done: (items: T) => void,
  ): void {
    if (!this.error) note(body, text);
    if (this.loading.has(tab) || this.error) return;
    this.loading.add(tab);
    load()
      .then((items) => {
        this.loading.delete(tab);
        done(items);
        this.render();
      })
      .catch((error: unknown) => {
        this.loading.delete(tab);
        this.fail(error);
      });
  }

  private renderKenney(body: HTMLElement): void {
    if (!this.kenney) {
      this.loadList(
        "kenney",
        body,
        t("Loading the Kenney kit…"),
        loadKenneyCatalog,
        (items) => (this.kenney = items),
      );
      return;
    }
    const shown = this.kenney.filter((item) =>
      this.matches(item.name, t(CATEGORY_NAMES[item.category]), CATEGORY_NAMES[item.category]),
    );
    bySection(body, shown, (cards, item) => {
      card(
        cards,
        item.name,
        `${size(item.size.x)} × ${size(item.size.y)}`,
        item.thumbnail ? image(`./models/kenney/${item.thumbnail}`) : symbolPicture(null),
        () => {
          // The plan uses one model for each file of the kit, so the pieces share it.
          const existing = this.host
            .building()
            .models.find((m) => m.origin === "kenney" && m.ref === item.file);
          const model = existing ?? kenneyModel(item);
          this.host.addModel(model);
          const piece = newFurniture({ kind: "model", modelId: model.id }, { x: 0, y: 0 }, model);
          piece.elevation = hangingHeight(item.name, model.size.z);
          this.host.place(piece, model);
        },
      );
    });
    note(body, t("Kenney Furniture Kit, CC0 1.0 (kenney.nl)."));
  }

  private renderPolyHaven(body: HTMLElement): void {
    if (!this.polyHaven) {
      this.loadList(
        "polyhaven",
        body,
        t("Loading the furniture of Poly Haven… The app asks polyhaven.com for the list."),
        listFurniture,
        (items) => (this.polyHaven = items),
      );
      return;
    }
    const shown = this.polyHaven.filter((item) =>
      this.matches(
        item.name,
        t(CATEGORY_NAMES[item.category]),
        CATEGORY_NAMES[item.category],
        ...item.categories,
      ),
    );
    bySection(body, shown, (cards, item) => {
      const element = card(
        cards,
        item.name,
        "CC0",
        image(item.thumbnail),
        () => void this.downloadPolyHaven(item),
      );
      element.dataset.id = item.id;
      if (this.busy.has(item.id)) element.classList.add("busy");
    });
    note(
      body,
      t(
        "Realistic models from polyhaven.com, CC0 1.0. A click downloads the model with 1k textures (a few MB). The plan file then contains it.",
      ),
    );
  }

  private async downloadPolyHaven(item: PolyHavenItem): Promise<void> {
    if (this.busy.has(item.id)) return;
    const existing = this.host
      .building()
      .models.find((m) => m.origin === "polyhaven" && m.ref === item.id);
    if (existing) {
      this.host.place(
        newFurniture({ kind: "model", modelId: existing.id }, { x: 0, y: 0 }, existing),
        existing,
      );
      return;
    }
    this.busy.add(item.id);
    this.markBusy(item.id, true);
    this.host.status(t("Downloading {name} from Poly Haven…", { name: item.name }));
    try {
      const model = await downloadModel(item);
      this.host.addModel(model);
      this.host.status(t("Downloaded {name}. Click on the plan to place it.", { name: item.name }));
      this.host.place(
        newFurniture({ kind: "model", modelId: model.id }, { x: 0, y: 0 }, model),
        model,
      );
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy.delete(item.id);
      this.markBusy(item.id, false);
    }
  }

  /** Marks the card of a Poly Haven item. A render can replace the card while it downloads. */
  private markBusy(id: string, busy: boolean): void {
    for (const card of this.element.querySelectorAll<HTMLElement>(".card[data-id]")) {
      if (card.dataset.id === id) card.classList.toggle("busy", busy);
    }
  }

  private renderPlan(body: HTMLElement): void {
    const actions = document.createElement("div");
    actions.className = "actions";
    const button = document.createElement("button");
    button.className = "primary";
    button.innerHTML = icon("upload");
    button.append(t("Import a model (.glb, .gltf)"));
    button.addEventListener("click", () => void this.importFile());
    actions.append(button);
    body.append(actions);

    const models = this.host.building().models.filter((m) => this.matches(m.name, m.origin));
    if (models.length === 0) {
      note(
        body,
        t("The plan has no models yet. Import a model, or use one from Kenney or Poly Haven."),
      );
      return;
    }
    const cards = section(body, t("Models in this plan"));
    for (const model of models) {
      const origin = { import: t("Imported"), kenney: "Kenney", polyhaven: "Poly Haven" }[
        model.origin
      ];
      card(cards, model.name, origin, symbolPicture(null), () =>
        this.host.place(
          newFurniture({ kind: "model", modelId: model.id }, { x: 0, y: 0 }, model),
          model,
        ),
      );
    }
  }

  private async importFile(): Promise<void> {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".glb,.gltf,model/gltf-binary,model/gltf+json";
    const file = await new Promise<File | null>((resolve) => {
      input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
      input.addEventListener("cancel", () => resolve(null));
      input.click();
    });
    if (!file) return;
    this.host.status(t("Reading {name}…", { name: file.name }));
    try {
      const model = await importModelFile(file);
      this.host.addModel(model);
      this.host.status(t("Imported {name}. Click on the plan to place it.", { name: file.name }));
      this.render();
      this.host.place(
        newFurniture({ kind: "model", modelId: model.id }, { x: 0, y: 0 }, model),
        model,
      );
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): void {
    // The messages of the model have a translation in the dictionary.
    this.error = t(error instanceof Error ? error.message : String(error));
    this.host.status(this.error, true);
    this.render();
  }
}

// ----- Small parts -----

/**
 * The usual height above the floor of a piece that hangs: an upper kitchen cabinet, a mirror, or
 * a lamp or a fan at a ceiling of 2.5 m. Other pieces stand on the floor.
 */
function hangingHeight(name: string, height: number): number {
  const text = name.toLowerCase();
  if (text.includes("ceiling")) return Math.max(0, 2.5 - height);
  if (text.includes("upper")) return 1.45;
  if (text.includes("mirror")) return 1.1;
  return 0;
}

const size = (meters: number) => `${Math.round(meters * 100)}`;

/**
 * Shows the items in one section for each category, in the order of `CATEGORY_NAMES`. The items
 * of a category keep their order.
 */
function bySection<T extends { category: Category }>(
  body: HTMLElement,
  items: T[],
  fill: (cards: HTMLElement, item: T) => void,
): void {
  if (items.length === 0) {
    note(body, t("Nothing matches the search."));
    return;
  }
  for (const category of Object.keys(CATEGORY_NAMES) as Category[]) {
    const inCategory = items.filter((item) => item.category === category);
    if (inCategory.length === 0) continue;
    const cards = section(body, t(CATEGORY_NAMES[category]));
    for (const item of inCategory) fill(cards, item);
  }
}

function section(body: HTMLElement, title: string): HTMLElement {
  const heading = document.createElement("h3");
  heading.textContent = title;
  const cards = document.createElement("div");
  cards.className = "cards";
  body.append(heading, cards);
  return cards;
}

function note(body: HTMLElement, text: string, error = false): void {
  const element = document.createElement("p");
  element.className = error ? "note error" : "note";
  element.textContent = text;
  body.append(element);
}

function card(
  cards: HTMLElement,
  name: string,
  detail: string,
  picture: HTMLElement | SVGElement,
  action: () => void,
): HTMLButtonElement {
  const element = document.createElement("button");
  element.className = "card";
  element.title = name;
  const thumb = document.createElement("span");
  thumb.className = "thumb";
  thumb.append(picture);
  const label = document.createElement("span");
  label.textContent = name;
  const small = document.createElement("small");
  small.textContent = detail;
  element.append(thumb, label, small);
  element.addEventListener("click", action);
  cards.append(element);
  return element;
}

function image(url: string): HTMLImageElement {
  const element = document.createElement("img");
  element.src = url;
  element.alt = "";
  element.loading = "lazy";
  return element;
}

/** A small SVG of the plan symbol of a piece. Null gives a box with a cross, for a model. */
function symbolPicture(piece: Furniture | null): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const template = piece ?? newFurniture({ kind: "generic", type: "box" }, { x: 0, y: 0 });
  const symbol = furnitureSymbol(template);
  const w = template.width / 2;
  const d = template.depth / 2;
  const margin = Math.max(w, d) * 0.08;
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute(
    "viewBox",
    `${-w - margin} ${-d - margin} ${2 * (w + margin)} ${2 * (d + margin)}`,
  );
  const stroke = String(Math.max(w, d) * 0.03);
  for (const shape of symbol.shapes) {
    const polygon = document.createElementNS(ns, "polygon");
    polygon.setAttribute("points", shape.map((p) => `${p.x},${p.y}`).join(" "));
    polygon.setAttribute("class", "shape");
    polygon.setAttribute("stroke-width", stroke);
    svg.append(polygon);
  }
  for (const [a, b] of symbol.lines) {
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", String(a.x));
    line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x));
    line.setAttribute("y2", String(b.y));
    line.setAttribute("class", "line");
    line.setAttribute("stroke-width", stroke);
    svg.append(line);
  }
  return svg;
}
