import { t } from "../i18n";
import { type IconName } from "../icons";
import { energyBalance, type EnergyBalance } from "../model/balance";
import { fmt } from "../model/format";
import { heatingEnergy } from "../model/heating";
import { costItemText, estimateItems, subsidyEstimate, variantEconomy } from "../model/renovation";
import type { Building, Variant } from "../model/types";
import {
  addMeasure,
  applyVariant,
  MEASURES,
  measuresFor,
  measureVariant,
  sameAsPlan,
  updateVariant,
  variantOf,
  withVariant,
} from "../model/variants";
import { cached, doc, shell, showStatus } from "./context";
import {
  button,
  euro,
  field,
  heading,
  iconButton,
  numberField,
  paragraph,
  section,
  selectField,
  stats,
} from "./panel";

/**
 * The renovation: the variants with their measures, their cost, and their economy against the
 * plan. Each variant is a copy of the envelope, the heating, the heated stories, the household,
 * and the PV.
 */
export function renderRenovationTopic(): void {
  const building = doc.building;
  heading(t("Renovation"), "coins");
  const plan = cached("balance", () => energyBalance(doc.building));
  if (!plan) {
    paragraph(
      t(
        "The renovation compares the energy cost per year, so it needs the climate. Load it in the Location group of Energy.",
      ),
      "note",
    );
    button(t("Open Energy"), () => shell.setTopic("energy"), { icon: "gauge" });
    return;
  }
  const heat = cached("heating", () => heatingEnergy(doc.building));
  stats([
    [euro(plan.cost), t("energy cost per year now")],
    [`${fmt(plan.co2 / 1000, 1)} t`, t("CO₂ per year")],
    heat
      ? [`${fmt(heat.perArea, 0)} kWh/m² · ${heat.efficiencyClass}`, t("heat demand")]
      : ["–", t("heat demand: draw rooms")],
  ]);
  const finance = building.finance;
  const setFinance = (edit: (f: typeof finance) => void) =>
    doc.editBuilding((b) => edit(b.finance));
  selectField(
    t("Prices"),
    finance.region,
    [
      ["AT", t("Austria, 2025")],
      ["DE", t("Germany, 2025")],
    ],
    (region) => setFinance((f) => (f.region = region)),
  );
  numberField(
    t("Interest"),
    Math.round(finance.interest * 1000) / 10,
    (v) => setFinance((f) => (f.interest = v / 100)),
    {
      min: -10,
      step: 0.5,
      unit: t("% per year"),
    },
  );
  numberField(
    t("Energy prices"),
    Math.round(finance.priceIncrease * 1000) / 10,
    (v) => setFinance((f) => (f.priceIncrease = v / 100)),
    { min: -50, step: 0.5, unit: t("% per year") },
  );

  const list = document.createElement("div");
  list.className = "variants";
  for (const variant of building.variants) list.append(variantCard(variant, plan));
  section.append(list);

  const add = document.createElement("select");
  add.setAttribute("aria-label", t("Add a variant"));
  add.append(
    new Option(t("Add a variant…"), "", true, true),
    new Option(t("Copy of the plan"), "copy"),
  );
  for (const measure of MEASURES.filter((m) => m.available(building))) {
    add.append(new Option(t(measure.name), measure.id));
  }
  add.addEventListener("change", () => {
    const measure = MEASURES.find((m) => m.id === add.value);
    doc.editBuilding((b) =>
      b.variants.push(
        measure
          ? { ...measureVariant(b, measure), name: t(measure.name) }
          : variantOf(b, t("Copy of the plan")),
      ),
    );
  });
  field(t("New"), add);
  paragraph(
    t(
      "A variant starts from the plan. Add measures to it, or put it into the plan with the check mark, change it in the other topics, and save it back with the disk. The cost is an estimate from usual prices of the region, without the scaffold. Type the price of a real offer to replace it. The payback time counts the interest and the change of the energy prices. For Germany, the app estimates the federal subsidy (BEG EM, 2025, without the bonus for the income and the iSFP). For Austria, the programs of the federal government and the states change often: see umweltfoerderung.at and your state, and type the amount. Check all rules before you decide.",
    ),
    "note",
  );
}

/** The card of one variant: its name, its actions, its measures, its cost, and its economy. */
function variantCard(variant: Variant, plan: EnergyBalance): HTMLElement {
  const building = doc.building;
  const card = document.createElement("div");
  card.className = "variant";
  const top = document.createElement("div");
  top.className = "variant-top";
  const name = document.createElement("input");
  name.type = "text";
  name.value = variant.name;
  name.setAttribute("aria-label", t("Name of the variant"));
  name.addEventListener("change", () => {
    const value = name.value.trim();
    if (value) editVariant(variant.id, (v) => (v.name = value));
  });
  const same = sameAsPlan(building, variant);
  const action = (iconName: IconName, title: string, act: () => void, disabled = false) =>
    iconButton(iconName, title, act, { disabled });
  top.append(
    name,
    action(
      "check",
      same ? t("The plan has this variant") : t("Use this variant in the plan"),
      () => {
        doc.editBuilding((b) =>
          applyVariant(
            b,
            b.variants.find((v) => v.id === variant.id)!,
          ),
        );
        showStatus(
          t('The plan now has the variant "{name}". Undo goes back.', { name: variant.name }),
        );
      },
      same,
    ),
    action(
      "save",
      t("Save the plan into this variant"),
      () => editVariant(variant.id, (v, b) => updateVariant(v, b)),
      same,
    ),
    action("trash", t("Delete the variant"), () =>
      doc.editBuilding((b) => (b.variants = b.variants.filter((v) => v.id !== variant.id))),
    ),
  );
  card.append(top);

  const economy = variantEconomy(building, variant, plan);
  const items = estimateItems(building, variant);
  const estimate = items.reduce((sum, i) => sum + i.cost, 0);

  // The cost and the subsidy: two small fields. An empty cost uses the estimate.
  const money = document.createElement("div");
  money.className = "variant-money";
  const moneyField = (
    label: string,
    value: number | null,
    placeholder: string,
    change: (value: number | null) => void,
  ) => {
    const element = document.createElement("label");
    element.append(label);
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
    element.append(input);
    money.append(element);
  };
  moneyField(
    t("Cost €"),
    variant.cost,
    t("{amount} (estimate)", { amount: Math.round(estimate) }),
    (v) => editVariant(variant.id, (x) => (x.cost = v)),
  );
  moneyField(t("Subsidy €"), variant.subsidy || null, "0", (v) =>
    editVariant(variant.id, (x) => (x.subsidy = v ?? 0)),
  );
  card.append(money);
  const subsidy = subsidyEstimate(building, variant);
  if (subsidy && subsidy.amount > 0 && Math.abs(subsidy.amount - variant.subsidy) >= 1) {
    const use = document.createElement("button");
    use.className = "variant-subsidy";
    use.textContent = t("Use the BEG estimate: {amount}", { amount: euro(subsidy.amount) });
    use.title = subsidy.items.map((i) => `${t(i.name)}: ${Math.round(i.rate * 100)} %`).join(", ");
    use.addEventListener("click", () =>
      editVariant(variant.id, (x) => (x.subsidy = Math.round(subsidy.amount))),
    );
    card.append(use);
  }

  const values = document.createElement("div");
  values.className = "variant-values";
  if (economy) {
    const result = heatingEnergy(withVariant(building, variant));
    const lines = [
      t("{amount} energy cost per year", { amount: euro(economy.balance.cost) }),
      result ? `${fmt(result.perArea, 0)} kWh/m² · ${result.efficiencyClass}` : "",
      `${fmt(economy.balance.co2 / 1000, 1)} t CO₂`,
    ].filter(Boolean);
    values.textContent = lines.join(" · ");
    const verdict = document.createElement("div");
    verdict.className = "variant-verdict";
    const saving = document.createElement("span");
    saving.className = economy.saving > 0.5 ? "better" : economy.saving < -0.5 ? "worse" : "";
    saving.textContent =
      Math.abs(economy.saving) < 0.5
        ? t("No saving")
        : economy.saving > 0
          ? t("Saves {amount} per year", { amount: euro(economy.saving) })
          : t("Costs {amount} per year", { amount: euro(-economy.saving) });
    verdict.append(saving);
    const payback =
      economy.payback == null
        ? ""
        : economy.net <= 0
          ? ` · ${t("pays back at once")}`
          : economy.payback > 50
            ? ` · ${t("pays back in more than 50 years")}`
            : economy.payback < 1
              ? ` · ${t("pays back in less than 1 year")}`
              : ` · ${t("pays back in {years} years", { years: Math.round(economy.payback) })}`;
    const co2 =
      Math.abs(economy.co2Saving) >= 50
        ? ` · ${economy.co2Saving > 0 ? "−" : "+"}${fmt(Math.abs(economy.co2Saving) / 1000, 1)} t CO₂`
        : "";
    verdict.append(`${payback}${co2}`);
    card.append(values, verdict);
  }

  // The items of the estimate, and a list to add one more measure.
  const details = document.createElement("details");
  details.className = "variant-details";
  const summary = document.createElement("summary");
  summary.textContent =
    items.length === 0 ? t("No changes against the plan") : `${t("Estimate")} · ${euro(estimate)}`;
  details.append(summary);
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "variant-item";
    const label = document.createElement("span");
    label.textContent = costItemText(item, t);
    const cost = document.createElement("span");
    cost.textContent = euro(item.cost);
    row.append(label, cost);
    details.append(row);
  }
  card.append(details);
  const measures = measuresFor(building, variant);
  if (measures.length > 0) {
    const add = document.createElement("select");
    add.className = "variant-add";
    add.setAttribute("aria-label", t("Add a measure to the variant"));
    add.append(new Option(t("Add a measure…"), "", true, true));
    for (const measure of measures) add.append(new Option(t(measure.name), measure.id));
    add.addEventListener("change", () => {
      const measure = MEASURES.find((m) => m.id === add.value);
      if (measure) editVariant(variant.id, (v, b) => addMeasure(b, v, measure));
    });
    card.append(add);
  }
  return card;
}

/** Changes one variant of the building. */
function editVariant(id: string, edit: (variant: Variant, building: Building) => void): void {
  doc.editBuilding((b) => {
    const variant = b.variants.find((v) => v.id === id);
    if (variant) edit(variant, b);
  });
}
