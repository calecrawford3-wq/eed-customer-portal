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

export function printEngineLabel({ engineSerialNumber, eedId, customerName, platformName, storageLocation, statusLabel, barcodeValue }) {
  const barcode = generateBarcodeSVG(barcodeValue || engineSerialNumber, { width: 1.6, height: 40, fontSize: 12 });
  const statusBg = STATUS_COLORS[statusLabel] || "#475569";

  const html = `<!DOCTYPE html>
<html><head><title>Engine Label - ${esc(engineSerialNumber)}</title>
<style>
  @page { size: 4in 2in; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .label {
    width: 4in; height: 2in;
    padding: 8px 10px;
    display: flex; flex-direction: column; justify-content: space-between;
    overflow: hidden;
  }
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
  </div>
  <script>window.onload = () => { setTimeout(() => window.print(), 300); };</script>
</body></html>`;

  const w = window.open("", "_blank", "width=500,height=350");
  if (!w) {
    alert("Please allow popups to print the engine label.");
    return false;
  }
  w.document.write(html);
  w.document.close();
  return true;
}