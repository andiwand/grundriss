// The dialogs of the app: a title, a close button, and a body with fields, notes, and buttons.
// Esc or a click outside closes a dialog.

import { t } from "../i18n";
import { iconButton } from "./panel";

/** A dialog with a title and a close button. Esc or a click outside closes it. */
export function dialog(title: string): { element: HTMLDialogElement; body: HTMLElement } {
  const element = document.createElement("dialog");
  element.className = "app-dialog";
  const head = document.createElement("div");
  head.className = "app-dialog-head";
  const heading = document.createElement("h2");
  heading.textContent = title;
  head.append(
    heading,
    iconButton("close", t("Close"), () => element.close()),
  );
  const body = document.createElement("div");
  body.className = "app-dialog-body";
  element.append(head, body);
  element.addEventListener("click", (e) => e.target === element && element.close());
  element.addEventListener("close", () => element.remove());
  document.body.append(element);
  element.showModal();
  return { element, body };
}

export function row(parent: HTMLElement, label: string, control: HTMLElement): void {
  const element = document.createElement("label");
  element.className = "dialog-field";
  const text = document.createElement("span");
  text.textContent = label;
  element.append(text, control);
  parent.append(element);
}

export function note(parent: HTMLElement, text: string, className = "dialog-note"): HTMLElement {
  const element = document.createElement("p");
  element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

export function actionButton(text: string, action: () => void, primary = false): HTMLButtonElement {
  const element = document.createElement("button");
  element.textContent = text;
  if (primary) element.className = "primary";
  element.addEventListener("click", action);
  return element;
}
