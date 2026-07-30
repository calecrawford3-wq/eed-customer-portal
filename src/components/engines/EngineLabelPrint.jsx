import { generateBarcodeSVG } from "@/components/inventory/BarcodeLabel";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const STATUS_COLORS = {
  "CHECKED IN": "#e20404",
  "ESTIMATE PENDING": "#d97706",
  "CLEANING": "#0891b2",
  "MACHINING": "#ea580c",
  "ASSEMBLY": "#7c3aed",
  "COMPLETED": "#059669",
  "PICKED UP": "#6b7280",
};

export function printEngineLabel({ engineSerialNumber, eedId, customerName, platformName, storageLocation, statusLabel, barcodeValue, startPos = 1 }) {
  const barcode = generateBarcodeSVG(barcodeValue || engineSerialNumber, { width: 1.6, height: 40, fontSize: 12 });
  const statusBg = STATUS_COLORS[statusLabel] || "#475569";

  const blanks = Math.max(0, Math.min(9, (startPos || 1) - 1));
  const cells = [
    ...Array.from({ length: blanks }).map(() => ({ empty: true })),
    { real: true },
  ];
  while (cells.length < 10) cells.push({ empty: true });

  const renderCell = (c) => {
    if (c.empty) return `<div class="label empty"></div>`;
    return `
      <div class="label">
        <div class="header">
          <div>
            <div class="serial">${esc(engineSerialNumber)}</div>
            ${eedId ? `<div class="eed">${esc(eedId)}</div>` : ""}
          </div>
          ${statusLabel ? `<div class="status-badge">${esc(statusLabel)}</div>` : ""}
        </div>
        ${customerName ? `<div class="customer">${esc(customerName)}</div>` : ""}
        ${platformName ? `<div class="platform">${esc(platformName)}</div>` : ""}
        <div class="barcode">${barcode || ""}</div>
        <div class="footer">
          <span class="loc">📍 <span class="loc-value">${esc(storageLocation || "—")}</span></span>
          <span class="code">${esc(barcodeValue || engineSerialNumber)}</span>
        </div>
      </div>`;
  };

  const html = `<!DOCTYPE html>
<html><head><title>Engine Label - ${esc(engineSerialNumber)}</title>
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
  /* Avery 18163: 2 columns × 5 rows = 10 labels per sheet, 4in × 2in each */
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
    padding: 5px 8px;
    display: flex; flex-direction: column; justify-content: space-between;
    overflow: hidden;
    break-inside: avoid;
  }
  .label.empty { border: none; padding: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; }
  .serial { font-size: 13px; font-weight: 800; line-height: 1.2; }
  .eed { font-size: 11px; font-weight: 700; color: #e20404; font-family: monospace; }
  .status-badge { font-size: 8px; font-weight: 700; color: white; padding: 2px 6px; border-radius: 3px; background: ${statusBg}; white-space: nowrap; flex-shrink: 0; }
  .customer { font-size: 10px; color: #333; font-weight: 600; }
  .platform { font-size: 8.5px; color: #555; }
  .barcode { text-align: center; flex: 1; display: flex; align-items: center; justify-content: center; padding: 2px 0; }
  .barcode svg { max-width: 100%; height: auto; }
  .footer { display: flex; justify-content: space-between; align-items: center; font-size: 9px; }
  .loc { color: #555; }
  .loc-value { font-weight: 700; }
  .code { font-family: monospace; font-size: 8px; }
</style></head>
<body>
  <div class="page"><div class="labels">${cells.map(renderCell).join("")}</div></div>
  <script>window.onload = () => { setTimeout(() => window.print(), 300); };</script>
</body></html>`;

  const w = window.open("", "_blank", "width=800,height=600");
  if (!w) {
    alert("Please allow popups to print the engine label.");
    return false;
  }
  w.document.write(html);
  w.document.close();
  return true;
}