import { generateBarcodeSVG } from "@/components/inventory/BarcodeLabel";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const CATEGORY_COLORS = {
  engines: "#e20404",
  carts: "#0891b2",
  stands: "#7c3aed",
  parts: "#ea580c",
};

const CATEGORY_LABELS = {
  engines: "ENGINE STAND",
  carts: "CART",
  stands: "STAND",
  parts: "PARTS",
};

/**
 * Prints a sheet of storage location labels (Avery 18163, 4in × 2in).
 * Accepts either a single location or an array of locations.
 *
 * @param {Object|Array} opts
 * @param {string} opts.name        — The location name to print (e.g. "Cart 1", "ES1")
 * @param {string} opts.category   — One of: engines, carts, stands, parts
 * @param {number} opts.startPos   — Starting label position (1-10) on the sheet
 * @param {number} opts.copies     — Number of labels to print (1-10)  [single-location mode only]
 * @param {Array}  opts.locations  — Array of { name, category } to print multiple locations on one sheet
 */
export function printStorageLocationLabel(opts) {
  // Normalize into a flat list of { name, category } entries
  let entries = [];
  if (Array.isArray(opts?.locations)) {
    entries = opts.locations.filter((l) => l && l.name).map((l) => ({ name: l.name, category: l.category || "parts" }));
  } else {
    const copies = Math.min(10, Math.max(1, opts?.copies || 1));
    for (let i = 0; i < copies; i++) {
      entries.push({ name: opts?.name, category: opts?.category || "parts" });
    }
  }

  if (entries.length === 0) return false;

  const blanks = Math.max(0, Math.min(9, (opts?.startPos || 1) - 1));
  const cells = [
    ...Array.from({ length: blanks }).map(() => ({ empty: true })),
    ...entries.slice(0, 10 - blanks).map((e) => ({ real: true, ...e })),
  ];
  while (cells.length < 10) cells.push({ empty: true });

  const renderCell = (c) => {
    if (c.empty) return `<div class="label empty"></div>`;
    const barcode = generateBarcodeSVG(c.name, { width: 2, height: 50, fontSize: 14 });
    const catColor = CATEGORY_COLORS[c.category] || "#475569";
    const catLabel = CATEGORY_LABELS[c.category] || "STORAGE";
    return `
      <div class="label">
        <div class="header">
          <div class="cat-badge" style="background:${catColor}">${esc(catLabel)}</div>
        </div>
        <div class="name">${esc(c.name)}</div>
        <div class="barcode">${barcode || ""}</div>
        <div class="footer">
          <span class="loc-icon">📍</span>
          <span class="code">${esc(c.name)}</span>
        </div>
      </div>`;
  };

  const html = `<!DOCTYPE html>
<html><head><title>Storage Labels</title>
<style>
  @page { size: 8.5in 11in; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .page {
    width: 8.5in; height: 11in;
    padding: 0.5in 0.15625in;
    page-break-after: always;
    page-break-inside: avoid;
  }
  .page:last-child { page-break-after: auto; }
  .labels {
    display: grid;
    grid-template-columns: repeat(2, 4in);
    grid-template-rows: repeat(5, 2in);
    column-gap: 0.1875in;
    row-gap: 0in;
    width: 8.1875in;
    height: 10in;
  }
  .label {
    width: 4in; height: 2in;
    padding: 8px 10px;
    display: flex; flex-direction: column; justify-content: space-between;
    overflow: hidden;
    break-inside: avoid;
  }
  .label.empty { border: none; padding: 0; }
  .header { display: flex; justify-content: flex-start; }
  .cat-badge {
    font-size: 9px; font-weight: 700; color: white;
    padding: 3px 10px; border-radius: 4px;
    letter-spacing: 0.5px;
  }
  .name {
    font-size: 36px; font-weight: 900; line-height: 1.1;
    text-align: center; flex: 0 0 auto; padding: 4px 0;
    color: #1e293b;
  }
  .barcode { text-align: center; flex: 1; display: flex; align-items: center; justify-content: center; padding: 2px 0; }
  .barcode svg { max-width: 100%; height: auto; }
  .footer { display: flex; justify-content: space-between; align-items: center; font-size: 10px; }
  .loc-icon { font-size: 12px; }
  .code { font-family: monospace; font-size: 9px; color: #555; }
</style></head>
<body>
  <div class="page"><div class="labels">${cells.map(renderCell).join("")}</div></div>
  <script>window.onload = () => { setTimeout(() => window.print(), 300); };</script>
</body></html>`;

  const w = window.open("", "_blank", "width=800,height=600");
  if (!w) {
    alert("Please allow popups to print the storage location label.");
    return false;
  }
  w.document.write(html);
  w.document.close();
  return true;
}