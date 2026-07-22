// E2E: the operation-comparison must be fully scrollable to the LAST field of the LAST
// operation, at every viewport — the bug reported as "solo veo la primera operación, no
// puedo bajar a la segunda".
//
// Runs against the isolated fixture at /dev-compare-harness (dev/test only, 404 in prod),
// which renders the REAL <CompareModal> inside the same `.in-reveal` transformed ancestor as
// the app, with rich mock operations and NO auth/Supabase — so nothing touches production.
//
// Runnable on demand (Playwright is not a default dependency, per e2e/README.md):
//   npm i -D @playwright/test && npx playwright install chromium
//   npx next dev --webpack -p 3311   # in another shell
//   DIAG_BASE=http://localhost:3311 npx playwright test e2e/compare-scroll.spec.ts
//
// Verified passing at desktop-xl / laptop / tablet-landscape / tablet-portrait / mobile /
// mobile-small (2 ops) and mobile (3 ops) on 2026-07-22.

import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.DIAG_BASE ?? "http://localhost:3311";

const VIEWPORTS = [
  { name: "desktop-xl", width: 1920, height: 1080, narrow: false },
  { name: "laptop", width: 1366, height: 768, narrow: false },
  { name: "tablet-landscape", width: 1024, height: 768, narrow: false },
  { name: "tablet-portrait", width: 768, height: 1024, narrow: false },
  { name: "mobile", width: 390, height: 740, narrow: true },
  { name: "mobile-small", width: 360, height: 640, narrow: true },
];

async function openCompare(page: Page, which: "open-2" | "open-3") {
  await page.goto(`${BASE}/dev-compare-harness`, { waitUntil: "networkidle" });
  await page.getByTestId(which).click();
  await page.getByRole("dialog").waitFor({ state: "visible" });
  return page.getByRole("region", { name: "Tabla comparativa de inversiones" });
}

// State of the last value cell of the LAST operation, in whichever layout is active for the
// viewport (stacked cards on narrow, side-by-side table on wide).
async function lastOpCellState(page: Page, narrow: boolean, opCount: number) {
  return page.evaluate(({ narrow, opCount }) => {
    const region = document.querySelector('[role="region"][aria-label="Tabla comparativa de inversiones"]') as HTMLElement | null;
    if (!region) return { ok: false, reason: "no-region" };
    let target: HTMLElement | undefined;
    if (narrow) {
      const sections = region.querySelectorAll('[data-testid="compare-stacked"] > section');
      if (sections.length !== opCount) return { ok: false, reason: `stacked-sections=${sections.length}` };
      const lastSection = sections[sections.length - 1] as HTMLElement;
      const dds = lastSection.querySelectorAll("dd");
      target = dds[dds.length - 1] as HTMLElement | undefined;
    } else {
      const visRows = Array.from(region.querySelectorAll("tbody tr")).filter((r) => (r as HTMLElement).offsetParent !== null);
      const lastRow = visRows[visRows.length - 1] as HTMLElement | undefined;
      const cells = lastRow?.querySelectorAll("td");
      target = cells?.[cells.length - 1] as HTMLElement | undefined;
    }
    if (!target) return { ok: false, reason: "no-target" };
    const cr = target.getBoundingClientRect();
    const rr = region.getBoundingClientRect();
    const insideRegion = cr.top >= rr.top - 1 && cr.bottom <= rr.bottom + 1;
    const cx = Math.min(Math.max(cr.left + cr.width / 2, 0), window.innerWidth - 1);
    const cy = Math.min(Math.max(cr.top + cr.height / 2, 0), window.innerHeight - 1);
    const topEl = document.elementFromPoint(cx, cy);
    const covered = !(topEl && (target.contains(topEl) || topEl.contains(target) || topEl === target));
    return { ok: insideRegion && !covered, insideRegion, covered, text: (target.textContent ?? "").trim().slice(0, 30) };
  }, { narrow, opCount });
}

// Exactly one element in the modal owns the VERTICAL scroll (no competing second bar).
async function verticalScrollerCount(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
    if (!dialog) return -1;
    let count = 0;
    dialog.querySelectorAll("*").forEach((node) => {
      const e = node as HTMLElement;
      if (e.offsetParent === null && e !== document.body) return; // ignore hidden layout
      const st = getComputedStyle(e);
      if ((st.overflowY === "auto" || st.overflowY === "scroll") && e.scrollHeight > e.clientHeight + 1) count++;
    });
    return count;
  });
}

for (const vp of VIEWPORTS) {
  test(`comparison scrolls to the last field of the last operation · 2 ops · ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const region = await openCompare(page, "open-2");

    await region.evaluate((n) => { n.scrollTop = n.scrollHeight; });
    await page.waitForTimeout(120);
    const after = await region.evaluate((n) => ({ scrollHeight: n.scrollHeight, clientHeight: n.clientHeight, scrollTop: n.scrollTop }));
    const last = await lastOpCellState(page, vp.narrow, 2);
    const vScrollers = await verticalScrollerCount(page);

    expect(after.scrollHeight, "content overflows the region").toBeGreaterThan(after.clientHeight);
    expect(after.scrollTop, "reaches (near) the bottom").toBeGreaterThan(after.scrollHeight - after.clientHeight - 4);
    expect(last.ok, `last field of last op visible & uncovered (${JSON.stringify(last)})`).toBe(true);
    expect(vScrollers, "one vertical scroll owner").toBeLessThanOrEqual(1);
  });
}

test("3 operations · mobile · the third operation is reachable by vertical scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  const region = await openCompare(page, "open-3");
  await region.evaluate((n) => { n.scrollTop = n.scrollHeight; });
  await page.waitForTimeout(120);
  const last = await lastOpCellState(page, true, 3);
  expect(last.ok, `3rd op last field reachable (${JSON.stringify(last)})`).toBe(true);
});
