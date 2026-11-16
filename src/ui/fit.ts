/**
 * Makes a bar shorter in steps until it fits, for each language and each content.
 *
 * Each step is a class on the bar. The steps add up: step 2 keeps the class of step 1. The bar
 * gets the class `fit-<step>` for each step that it needs, and `fit-none` if all steps are not
 * enough. A fixed width in the CSS does not work, because the texts of each language have a
 * different length.
 */
export function fitBar(bar: HTMLElement, steps: string[], fits: () => boolean): void {
  const classes = [...steps.map((step) => `fit-${step}`), "fit-none"];
  let frame = 0;

  const fit = () => {
    frame = 0;
    bar.classList.remove(...classes);
    for (const name of classes) {
      if (fits()) return;
      bar.classList.add(name);
    }
  };

  // A change of the classes changes the sizes again. The next frame does the fit, so the
  // observer does not loop in one frame. The second fit gives the same result, and stops.
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(fit);
  };
  const observer = new ResizeObserver(schedule);
  const observe = () => {
    observer.disconnect();
    observer.observe(bar);
    // The parent gives the space: a bar with all its steps does not change its size when the
    // space grows.
    if (bar.parentElement) observer.observe(bar.parentElement);
    for (const child of bar.children) observer.observe(child);
  };
  observe();
  // A child can come or go, for example the button of a server.
  new MutationObserver(() => {
    observe();
    schedule();
  }).observe(bar, { childList: true });
}

/** True if the visible children of a bar that wraps are all in its first row. */
export function inOneRow(bar: HTMLElement): boolean {
  let bottom = Infinity;
  for (const child of bar.children) {
    const rect = child.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    if (bottom === Infinity) bottom = rect.bottom;
    else if (rect.top >= bottom) return false;
  }
  return bar.scrollWidth <= bar.clientWidth;
}

/** True if the content of a bar that scrolls to the side is not wider than the bar. */
export function noScroll(bar: HTMLElement): boolean {
  return bar.scrollWidth <= bar.clientWidth;
}
