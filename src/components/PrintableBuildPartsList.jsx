import React from "react";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png";

const STAGE_LABELS = { stock: "Stock", stage_1: "Stage 1", stage_2: "Stage 2", stage_3: "Stage 3", contract: "Contract", custom: "Custom" };

export default function PrintableBuildPartsList({ form, customer, customerEngine, platform, specSheet }) {
  const docNumber = form.invoice_number || form.estimate_number || "";
  const stageLabel = specSheet
    ? (specSheet.custom_name || STAGE_LABELS[specSheet.spec_type] || specSheet.spec_type)
    : (customerEngine ? (STAGE_LABELS[customerEngine.current_stage] || customerEngine.current_stage || "") : "");
  const yearRange = platform?.year_range_start
    ? `${platform.year_range_start}${platform.year_range_end ? `–${platform.year_range_end}` : "+"}`
    : "";

  return (
    <div className="invoice-page">
      <div className="inv-header">
        <div>
          <img src={LOGO_URL} alt="Elite Engine Development" style={{ height: "36px" }} />
        </div>
        <div style={{ textAlign: "right" }}>
          <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0, color: "#1a1a1a" }}>Engine Build Parts List</h1>
          <p style={{ fontSize: "12px", color: "#999", margin: "2px 0 0" }}>{docNumber}</p>
        </div>
      </div>

      <div className="inv-engine-bar">
        {customerEngine?.engine_serial_number && (
          <div><span className="lbl">Engine S/N</span><div style={{ fontWeight: "bold" }}>{customerEngine.engine_serial_number}</div></div>
        )}
        {customerEngine?.eed_id && (
          <div><span className="lbl">EED ID</span><div style={{ fontWeight: "bold", color: "#e20404" }}>{customerEngine.eed_id}</div></div>
        )}
        {platform?.manufacturer && (
          <div><span className="lbl">Make</span><div style={{ fontWeight: "bold" }}>{platform.manufacturer}</div></div>
        )}
        {platform?.name && (
          <div><span className="lbl">Model</span><div style={{ fontWeight: "bold" }}>{platform.name}</div></div>
        )}
        {yearRange && (
          <div><span className="lbl">Year</span><div style={{ fontWeight: "bold" }}>{yearRange}</div></div>
        )}
        {stageLabel && (
          <div><span className="lbl">Stage</span><div style={{ fontWeight: "bold" }}>{stageLabel}</div></div>
        )}
        {specSheet?.version && (
          <div><span className="lbl">Spec Version</span><div style={{ fontWeight: "bold" }}>v{specSheet.version}</div></div>
        )}
      </div>

      {customer && (
        <div className="inv-billto">
          <span className="lbl">Customer</span>
          <p style={{ fontWeight: 600, margin: "2px 0 0" }}>
            {customer.first_name} {customer.last_name}{customer.company_name ? ` — ${customer.company_name}` : ""}
          </p>
        </div>
      )}

      <table className="inv-items-table">
        <thead>
          <tr>
            <th style={{ width: "120px" }}>Part #</th>
            <th>Item Name</th>
            <th className="inv-center inv-col-qty">Qty</th>
          </tr>
        </thead>
        <tbody>
          {(form.line_items || []).filter(l => l.item_name || l.part_number).map((line, idx) => (
            <tr key={idx}>
              <td style={{ fontFamily: "monospace", fontSize: "11px" }}>{line.part_number}</td>
              <td>{line.item_name}{line.is_kit && <span style={{ fontSize: "10px", color: "#999" }}> ({(line.kit_components || []).length} components)</span>}</td>
              <td className="inv-center inv-col-qty">{line.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="inv-footer">
        <p>Elite Engine Development — Engine Build Parts List</p>
        <p>Generated {new Date().toLocaleDateString()}</p>
      </div>
    </div>
  );
}