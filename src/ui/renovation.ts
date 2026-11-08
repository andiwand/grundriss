import { t } from "../i18n";
import { type IconName } from "../icons";
import { energyBalance, type EnergyBalance } from "../model/balance";
import { fmt } from "../model/format";
import { HEATING_KINDS, heatingEnergy } from "../model/heating";
import {
  costItems,
  costItemText,
  LIFETIME,
  PAYBACK_LIMIT,
  subsidyEstimate,
  summaryOf,
  variantEconomy,
  type Summary,
} from "../model/renovation";
import type { Building, Variant } from "../model/types";
import { layoutChanges } from "../model/layout";
import { findRooms } from "../model/rooms";
import {
  addMeasure,
  applyVariant,
  hasOwnLayout,
  MEASURES,
  measuresFor,
  measureVariant,
  planBuilding,
  sameAsPlan,
  switchVariant,
  variantOf,
  withVariant,
} from "../model/variants";
import { $, cached, doc, editor, shell, showStatus } from "./context";
import {
  button,
  euro,
  field,
  group,
  heading,
  iconButton,
  numberField,
  paragraph,
  section,
  selectField,
  setSection,
  stats,
  table,
} from "./panel";

/**
 * Opens the variant with the id, or the plan for null. The changes in all topics then go into the
 * variant.
 */
export function openVariant(id: string | null): void {
  const name = doc.building.variants.find((v) => v.id === id)?.name ?? "";
  doc.editBuilding((b) => switchVariant(b, id));
  editor.select(null);
  showStatus(
    id
      ? t('You see and edit the variant "{name}". The plan does not change.', { name })
      : t("You see and edit the plan."),
  );
}

/** The switch of the variants in the top bar. It shows only if the plan has variants. */
export function renderVariantSwitch(): void {
  const select = $<HTMLSelectElement>("#variant-switch");
  const building = doc.building;
  if (!select.dataset.ready) {
    select.dataset.ready = "1";
    select.addEventListener("change", () => openVariant(select.value || null));
  }
  select.hidden = building.variants.length === 0;
  document.body.classList.toggle("has-variants", !select.hidden);
  const options: [string, string][] = [
    ["", t("Plan")],
    ...building.variants.map((v) => [v.id, v.name] as [string, string]),
  ];
  const key = JSON.stringify(options);
  // A new list only after a change of the variants, so that an open list does not close.
  if (select.dataset.key !== key) {
    select.dataset.key = key;
    select.replaceChildren(...options.map(([value, label]) => new Option(label, value)));
  }
  select.value = building.variant ?? "";
  select.classList.toggle("open", building.variant !== null);
}

/**
 * The renovation: the variants with their measures, their cost, and their economy against the
 * plan. Each variant is a copy of the envelope, the heating, the heated stories, the household,
 * the PV, and, if the user changes it, the floor plan.
 */
export function renderRenovationTopic(): void {
  const building = doc.building;
  heading(t("Renovation"), "coins");
  // The comparison opens in a dialog over the app, so the panel stays as it is.
  if (building.variants.length > 0) {
    const compare = document.createElement("button");
    compare.className = "heading-action";
    compare.textContent = t("Compare");
    compare.title = t("Compare the plan and all variants in a table");
    compare.addEventListener("click", showComparison);
    section.querySelector("h2")!.append(compare);
  }
  renderPlanColumn();
  heading(t("Variants"), "layers");
  if (building.variants.length === 0) {
    paragraph(t("No variants yet. Start one with New variant."), "note");
  }
  const plan = cached("plan-balance", () => energyBalance(planBuilding(doc.building)));
  for (const variant of building.variants) section.append(variantGroup(variant, plan));
  if (building.variants.length > 0) {
    paragraph(
      t(
        "The cost is an estimate from usual prices of the region, without the scaffold. Type the price of an offer to replace an item. For Germany, the app estimates the federal subsidy (BEG EM 2025, without the bonus for the income and the iSFP). For Austria, see umweltfoerderung.at and the programs of your state.",
      ),
      "note",
    );
  }
}

/** The left column: the open variant, the plan, the prices, and a new variant. */
function renderPlanColumn(): void {
  const building = doc.building;
  const open = building.variants.find((v) => v.id === building.variant);
  heading(t("The plan"), "roof");
  if (open) {
    paragraph(
      t('You see and edit the variant "{name}". The numbers compare with the plan.', {
        name: open.name,
      }),
      "note variant-open",
    );
    button(t("Back to the plan"), () => openVariant(null), { icon: "back" });
  }
  const plan = cached("plan-balance", () => energyBalance(planBuilding(doc.building)));
  const heat = cached("plan-heating", () => heatingEnergy(planBuilding(doc.building)));
  if (plan) {
    stats([
      [euro(plan.cost), t("energy cost per year now")],
      [`${fmt(plan.co2 / 1000, 1)} t`, t("CO₂ per year")],
      [
        heat ? `${fmt(heat.perArea, 0)} kWh/m² · ${heat.efficiencyClass}` : "–",
        heat ? t("heat demand") : t("heat demand: draw rooms"),
        true,
      ],
    ]);
  } else {
    // The variants and their cost work without the climate, but not the energy cost.
    paragraph(
      t(
        "The renovation compares the energy cost per year, so it needs the climate. Load it in the Location group of Energy.",
      ),
      "note",
    );
    button(t("Open Energy"), () => shell.setTopic("energy"), { icon: "gauge" });
  }

  const finance = building.finance;
  const setFinance = (edit: (f: typeof finance) => void) =>
    doc.editBuilding((b) => edit(b.finance));
  const region = finance.region === "AT" ? t("Austria, 2025") : t("Germany, 2025");
  const percent = (v: number) => `${fmt(v * 100, 1)} %`;
  group(
    `${t("Prices and interest")} · ${region} · ${percent(finance.interest)} · ${percent(finance.priceIncrease)}`,
    false,
    () => {
      selectField(
        t("Prices"),
        finance.region,
        [
          ["AT", t("Austria, 2025")],
          ["DE", t("Germany, 2025")],
        ],
        (value) => setFinance((f) => (f.region = value)),
      );
      numberField(
        t("Interest"),
        Math.round(finance.interest * 1000) / 10,
        (v) => setFinance((f) => (f.interest = v / 100)),
        { min: -10, step: 0.5, unit: t("% per year") },
      );
      numberField(
        t("Energy prices"),
        Math.round(finance.priceIncrease * 1000) / 10,
        (v) => setFinance((f) => (f.priceIncrease = v / 100)),
        { min: -50, step: 0.5, unit: t("% per year") },
      );
    },
  );

  heading(t("New variant"), "plus");
  const add = document.createElement("select");
  add.setAttribute("aria-label", t("Add a variant"));
  add.append(
    new Option(t("Choose…"), "", true, true),
    new Option(t("Copy of the plan"), "copy"),
    new Option(t("Another floor plan"), "layout"),
  );
  const measures = document.createElement("optgroup");
  measures.label = t("A measure");
  for (const measure of MEASURES.filter((m) => m.available(planBuilding(building)))) {
    measures.append(new Option(t(measure.name), measure.id));
  }
  if (measures.children.length > 0) add.append(measures);
  add.addEventListener("change", () => {
    const measure = MEASURES.find((m) => m.id === add.value);
    if (add.value === "layout") {
      // A new floor plan opens at once in the structure, where the user changes the walls.
      let id = "";
      const count = building.variants.length + 1;
      doc.editBuilding((b) => {
        const variant = variantOf(b, t("Floor plan {count}", { count }));
        b.variants.push(variant);
        id = variant.id;
      });
      openVariant(id);
      shell.setTopic("structure");
      return;
    }
    doc.editBuilding((b) =>
      b.variants.push(
        measure
          ? { ...measureVariant(b, measure), name: t(measure.name) }
          : variantOf(b, t("Copy of the plan")),
      ),
    );
  });
  field(t("Start from"), add);
  paragraph(
    t(
      "A variant starts from the plan. Open it to change it in all topics, also its walls and rooms; the plan stays as it is. The check mark makes a variant the new plan.",
    ),
    "note",
  );
}

/**
 * A variant as a group: its name and actions in the head, the key numbers, the items of the cost
 * with a field for an own price, the floor plan, and a list to add a measure.
 */
function variantGroup(variant: Variant, plan: EnergyBalance | null): HTMLElement {
  const building = doc.building;
  const isOpen = building.variant === variant.id;
  const same = sameAsPlan(building, variant);
  const economy = plan ? variantEconomy(building, variant, plan) : null;
  const items = costItems(building, variant);
  const estimate = items.reduce((sum, i) => sum + i.cost, 0);
  const cost = variant.cost ?? estimate;
  const net = Math.max(0, cost - variant.subsidy);
  const ownLayout = hasOwnLayout(building, variant);

  const details = document.createElement("details");
  details.className = "group variant";
  details.classList.toggle("open", isOpen);
  details.open = !closedVariants.has(variant.id);
  details.addEventListener("toggle", () => {
    if (details.open) closedVariants.delete(variant.id);
    else closedVariants.add(variant.id);
  });

  // The head: the name, the state, a short result, and the actions.
  const summary = document.createElement("summary");
  const title = document.createElement("span");
  title.className = "variant-title";
  title.textContent = variant.name;
  summary.append(title);
  if (isOpen) summary.append(tag(t("open"), "accent"));
  if (ownLayout) summary.append(tag(t("own floor plan"), "plain"));
  const result = document.createElement("span");
  result.className = "variant-result";
  if (economy && Math.abs(economy.saving) >= 0.5) {
    result.textContent =
      economy.saving > 0
        ? t("saves {amount} per year", { amount: euro(economy.saving) })
        : t("costs {amount} more per year", { amount: euro(-economy.saving) });
    result.classList.add(economy.saving > 0 ? "better" : "worse");
  }
  summary.append(result);
  const actions = document.createElement("span");
  actions.className = "variant-actions";
  // A click on an action must not open or close the group.
  const action = (iconName: IconName, text: string, act: () => void, disabled = false) => {
    const element = iconButton(iconName, text, act, { disabled });
    element.addEventListener("click", (e) => e.preventDefault());
    return element;
  };
  const openButton = action(
    "view3d",
    isOpen ? t("Back to the plan") : t("Open this variant to see and change it"),
    () => openVariant(isOpen ? null : variant.id),
  );
  openButton.classList.toggle("active", isOpen);
  actions.append(
    openButton,
    action(
      "check",
      same ? t("The plan has this variant") : t("Make this variant the plan"),
      () => {
        doc.editBuilding((b) =>
          applyVariant(
            b,
            b.variants.find((v) => v.id === variant.id)!,
          ),
        );
        editor.select(null);
        showStatus(
          t('The plan now has the variant "{name}". Undo goes back.', { name: variant.name }),
        );
      },
      same,
    ),
    action("trash", t("Delete the variant"), () =>
      doc.editBuilding((b) => {
        if (b.variant === variant.id) switchVariant(b, null);
        b.variants = b.variants.filter((v) => v.id !== variant.id);
      }),
    ),
  );
  summary.append(actions);
  details.append(summary);

  const outer = section;
  setSection(details);

  // The key numbers: what it costs, what it saves, and the heat demand.
  const target = withVariant(building, variant);
  const heat = heatingEnergy(target);
  const payback = economy?.payback;
  stats([
    [euro(net), t("investment after the subsidy")],
    [
      economy ? euro(economy.saving) : "–",
      economy ? t("saving per year") : t("saving per year: needs the climate"),
    ],
    [
      !economy
        ? "–"
        : payback == null
          ? economy.saving > 0
            ? `> ${PAYBACK_LIMIT}`
            : t("never")
          : payback < 1
            ? "< 1"
            : String(Math.round(payback)),
      t("years to pay back"),
    ],
    [heat ? `${fmt(heat.perArea, 0)} · ${heat.efficiencyClass}` : "–", t("kWh/m² heat demand")],
  ]);

  // The cost: each item with its estimate and an own price, the total, and the subsidy.
  const setItem = (key: string, value: number | null) =>
    editVariant(variant.id, (v) => {
      if (value === null) delete v.itemCosts[key];
      else v.itemCosts[key] = value;
    });
  const rows: (string | HTMLElement)[][] = items.map((item) => {
    const input = amountInput(item.own ? item.cost : null, "", (v) => setItem(item.name, v));
    input.setAttribute("aria-label", t("Price of {item} in €", { item: costItemText(item, t) }));
    return [
      costItemText(item, t),
      euro(item.estimate),
      withReset(
        input,
        item.own ? t("Use the estimate: {amount}", { amount: euro(item.estimate) }) : null,
        () => setItem(item.name, null),
      ),
    ];
  });
  const total = amountInput(variant.cost, "", (v) => editVariant(variant.id, (x) => (x.cost = v)));
  total.setAttribute("aria-label", t("Cost €"));
  rows.push([
    strong(t("Total")),
    strong(euro(estimate)),
    withReset(
      total,
      variant.cost != null
        ? t("Use the sum of the items: {amount}", { amount: euro(estimate) })
        : null,
      () => editVariant(variant.id, (x) => (x.cost = null)),
    ),
  ]);
  const subsidy = subsidyEstimate(building, variant);
  const subsidyInput = amountInput(variant.subsidy || null, "0", (v) =>
    editVariant(variant.id, (x) => (x.subsidy = v ?? 0)),
  );
  subsidyInput.setAttribute("aria-label", t("Subsidy €"));
  const subsidyAmount = subsidy ? Math.round(subsidy.amount) : 0;
  rows.push([
    t("Subsidy"),
    subsidy ? euro(subsidy.amount) : "–",
    withReset(
      subsidyInput,
      subsidy && subsidyAmount > 0 && subsidyAmount !== Math.round(variant.subsidy)
        ? t("Use the BEG estimate: {amount}", { amount: euro(subsidy.amount) })
        : null,
      () => editVariant(variant.id, (x) => (x.subsidy = subsidyAmount)),
    ),
  ]);
  if (items.length === 0 && variant.cost == null) {
    paragraph(t("No changes against the plan"), "note");
  } else {
    table([t("Item"), t("Estimate"), t("Your price")], rows, ["left", "right", "right"]);
  }

  // A variant with its own floor plan: its rooms, and a warning for walls that can carry a load.
  if (ownLayout) {
    const rooms = target.stories.flatMap((s) => findRooms(s));
    const planRooms = planBuilding(building).stories.flatMap((s) => findRooms(s)).length;
    const area = rooms.reduce((sum, r) => sum + r.area, 0);
    paragraph(
      t("Own floor plan: {rooms} rooms, {area} m² (the plan: {plan} rooms)", {
        rooms: rooms.length,
        area: fmt(area, 1),
        plan: planRooms,
      }),
      "note",
    );
    if (layoutChanges(planBuilding(building), target).bearing) {
      paragraph(
        t("A wall to remove can carry a load. Ask a structural engineer before you plan it."),
        "variant-warning",
      );
    }
  }

  const measures = measuresFor(building, variant);
  if (measures.length > 0) {
    const add = document.createElement("select");
    add.append(new Option(t("Choose…"), "", true, true));
    for (const measure of measures) add.append(new Option(t(measure.name), measure.id));
    add.addEventListener("change", () => {
      const measure = MEASURES.find((m) => m.id === add.value);
      if (measure) editVariant(variant.id, (v, b) => addMeasure(b, v, measure));
    });
    field(t("Add a measure"), add);
  }
  const name = document.createElement("input");
  name.type = "text";
  name.value = variant.name;
  name.addEventListener("change", () => {
    const value = name.value.trim();
    if (value) editVariant(variant.id, (v) => (v.name = value));
  });
  field(t("Name"), name);
  setSection(outer);
  return details;
}

/** A small label in the head of a variant. */
function tag(text: string, tone: "accent" | "plain"): HTMLElement {
  const element = document.createElement("span");
  element.className = `variant-tag ${tone}`;
  element.textContent = text;
  return element;
}

const strong = (text: string) => {
  const element = document.createElement("strong");
  element.textContent = text;
  return element;
};

/** A field with a button after it that goes back to the estimate, if `title` is not null. */
function withReset(input: HTMLInputElement, title: string | null, reset: () => void): HTMLElement {
  const box = document.createElement("span");
  box.className = "price";
  box.append(input);
  // Without a button, an empty place of its size keeps the fields of the table in one line.
  if (title) box.append(resetButton(title, reset));
  else box.append(Object.assign(document.createElement("span"), { className: "reset-space" }));
  return box;
}

/** A row of the comparison: a value of each summary, and which value is the best. */
interface CompareRow {
  label: string;
  text: (s: Summary) => string;
  /** The number to compare, or null. Without it, the row marks no best value. */
  score?: (s: Summary) => number | null;
  better?: "low" | "high";
}

/**
 * The comparison of the plan and the variants in a table, in a dialog: the cost, the energy, and
 * the floor plan. The best value of each row has a mark. Esc, the close button, or a click
 * outside closes it.
 */
function showComparison(): void {
  if (document.querySelector(".compare-dialog")) return;
  const building = doc.building;
  const columns: { name: string; id: string | null; summary: Summary }[] = [
    {
      name: t("Plan"),
      id: null,
      summary: cached("summary:plan", () => summaryOf(doc.building, null)),
    },
    ...building.variants.map((v) => ({
      name: v.name,
      id: v.id,
      summary: cached(`summary:${v.id}`, () => summaryOf(doc.building, v)),
    })),
  ];
  const none = "–";
  const money = (v: number | null) => (v === null ? none : euro(v));
  // A payback of null: no saving, or more than PAYBACK_LIMIT years.
  const years = (v: number | null, s: Summary) =>
    s === columns[0].summary || s.saving === null
      ? none
      : v === null
        ? s.saving > 0
          ? t("more than {years} years", { years: PAYBACK_LIMIT })
          : t("never")
        : v < 1
          ? t("< 1 year")
          : t("{years} years", { years: Math.round(v) });
  const isPlan = (s: Summary) => s === columns[0].summary;
  const rows: CompareRow[] = [
    {
      label: t("Investment"),
      text: (s) => (isPlan(s) ? none : euro(s.cost)),
      score: (s) => (isPlan(s) ? null : s.cost),
      better: "low",
    },
    { label: t("Subsidy"), text: (s) => (isPlan(s) ? none : euro(s.subsidy)) },
    {
      label: t("After the subsidy"),
      text: (s) => (isPlan(s) ? none : euro(s.net)),
      score: (s) => (isPlan(s) ? null : s.net),
      better: "low",
    },
    {
      label: t("Energy cost per year"),
      text: (s) => money(s.energyCost),
      score: (s) => s.energyCost,
      better: "low",
    },
    {
      label: t("Saving per year"),
      text: (s) => (isPlan(s) ? none : money(s.saving)),
      score: (s) => (isPlan(s) ? null : s.saving),
      better: "high",
    },
    {
      label: t("Payback"),
      text: (s) => years(s.payback, s),
      score: (s) => (isPlan(s) ? null : s.payback),
      better: "low",
    },
    {
      label: t("Cost over {years} years", { years: LIFETIME }),
      text: (s) => money(s.lifetime),
      score: (s) => s.lifetime,
      better: "low",
    },
    {
      label: t("Heat demand"),
      text: (s) =>
        s.perArea === null ? none : `${fmt(s.perArea, 0)} kWh/m² · ${s.efficiencyClass}`,
      score: (s) => s.perArea,
      better: "low",
    },
    {
      label: t("CO₂ per year"),
      text: (s) => (s.co2 === null ? none : `${fmt(s.co2 / 1000, 1)} t`),
      score: (s) => s.co2,
      better: "low",
    },
    {
      label: t("Self-sufficiency"),
      text: (s) => (s.selfSufficiency === null ? none : `${fmt(s.selfSufficiency * 100, 0)} %`),
      score: (s) => s.selfSufficiency,
      better: "high",
    },
    { label: t("Heating"), text: (s) => t(HEATING_KINDS[s.heating].name) },
    { label: t("PV"), text: (s) => (s.pvPeak > 0 ? `${fmt(s.pvPeak, 1)} kWp` : none) },
    { label: t("Battery"), text: (s) => (s.battery > 0 ? `${fmt(s.battery, 1)} kWh` : none) },
    {
      label: t("Floor plan"),
      text: (s) => t("{rooms} rooms · {area} m²", { rooms: s.rooms, area: fmt(s.area, 1) }),
    },
  ];

  const wrap = document.createElement("div");
  wrap.className = "compare-wrap";
  const table = document.createElement("table");
  table.className = "compare";
  const head = table.createTHead().insertRow();
  head.append(document.createElement("th"));
  for (const column of columns) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = column.name;
    if (column.id !== null && column.id === building.variant) th.classList.add("open");
    head.append(th);
  }
  const body = table.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = row.label;
    tr.append(th);
    // The best value: the lowest or the highest score, if the scores differ.
    const scores = columns.map((c) => row.score?.(c.summary) ?? null);
    const known = scores.filter((v): v is number => v !== null);
    let best: number | null = null;
    if (row.better && known.length > 1 && Math.max(...known) - Math.min(...known) > 1e-6) {
      best = row.better === "low" ? Math.min(...known) : Math.max(...known);
    }
    columns.forEach((column, i) => {
      const td = tr.insertCell();
      td.textContent = row.text(column.summary);
      if (best !== null && scores[i] !== null && Math.abs(scores[i]! - best) < 1e-6) {
        td.classList.add("best");
      }
    });
  }
  wrap.append(table);
  const dialog = document.createElement("dialog");
  dialog.className = "compare-dialog";
  // The dialog is about as wide as the table, so the notes wrap at its width.
  dialog.style.width = `${260 + 180 * columns.length}px`;
  const top = document.createElement("div");
  top.className = "compare-head";
  const title = document.createElement("h2");
  title.textContent = t("Compare the variants");
  top.append(
    title,
    iconButton("close", t("Close"), () => dialog.close()),
  );
  const block = document.createElement("div");
  block.className = "compare-block";
  block.append(wrap);
  dialog.append(top, block);
  const note = (text: string) => {
    const element = document.createElement("p");
    element.className = "note";
    element.textContent = text;
    block.append(element);
  };
  if (columns[0].summary.energyCost === null) {
    note(
      t(
        "The renovation compares the energy cost per year, so it needs the climate. Load it in the Location group of Energy.",
      ),
    );
  }
  note(
    t(
      "The cost over {years} years is the investment after the subsidy and the energy cost of {years} years in the money of today, with the interest and the change of the energy prices under Prices and interest. The best value of each row is green.",
      { years: LIFETIME },
    ),
  );
  dialog.addEventListener("click", (e) => e.target === dialog && dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

/** The variants that the user closed. The panel keeps them closed after a change. */
const closedVariants = new Set<string>();

/** A field for an amount in €. Empty gives null. */
function amountInput(
  value: number | null,
  placeholder: string,
  change: (value: number | null) => void,
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "100";
  input.placeholder = placeholder;
  input.value = value == null ? "" : String(Math.round(value));
  input.addEventListener("change", () => {
    const text = input.value.trim();
    const parsed = Number(text);
    if (text === "") change(null);
    else if (Number.isFinite(parsed) && parsed >= 0) change(parsed);
  });
  return input;
}

/** A small button that drops an own value and goes back to the estimate. */
function resetButton(title: string, action: () => void): HTMLButtonElement {
  const button = iconButton("undo", title, action);
  button.classList.add("reset");
  return button;
}

/** Changes one variant of the building. */
function editVariant(id: string, edit: (variant: Variant, building: Building) => void): void {
  doc.editBuilding((b) => {
    const variant = b.variants.find((v) => v.id === id);
    if (variant) edit(variant, b);
  });
}
