import React from "react";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png";

const STAGE_LABELS = { stock: "Stock", stage_1: "Stage 1", stage_2: "Stage 2", stage_3: "Stage 3", contract: "Contract", custom: "Custom" };

export default function PrintableEstimate({ estimate, customer, settings, customerEngine, platform, specSheet }) {
  if (!estimate) return null;

  const issueDate = estimate.issue_date ? new Date(estimate.issue_date).toLocaleDateString() : "N/A";
  const expiryDate = estimate.expiry_date ? new Date(estimate.expiry_date).toLocaleDateString() : "N/A";

  const companyAddress = [settings?.company_address, settings?.company_city ? `${settings.company_city}, ${settings.company_state} ${settings.company_zip}` : null, settings?.company_phone, settings?.company_email].filter(Boolean).join(" | ");
  const customerAddress = [customer.address_line1, customer.address_line2, customer.city ? `${customer.city}, ${customer.state} ${customer.zip}` : null, customer.phone, customer.email].filter(Boolean).join(" | ");

  const totalDepositReceived = (estimate.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  const depositRemaining = Math.max(0, (estimate.deposit_amount || 0) - totalDepositReceived);

  return (
    <div style={{ fontFamily: "Arial, sans-serif", padding: "24px", maxWidth: "800px", margin: "0 auto", color: "#333" }}>
      <div style={{ borderBottom: "3px solid #e20404", paddingBottom: "16px", marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <img src={LOGO_URL} alt={settings?.company_name} style={{ height: "60px", marginBottom: "8px" }} />
          <h1 style={{ fontSize: "28px", fontWeight: "bold", margin: 0, color: "#1a1a1a" }}>ESTIMATE</h1>
          <p style={{ fontSize: "14px", color: "#666", marginTop: "4px" }}>{settings?.company_name} | {companyAddress}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: "18px", fontWeight: "bold", color: "#e20404", marginBottom: "4px" }}>#{estimate.estimate_number}</p>
          <p style={{ fontSize: "13px", color: "#666" }}>Date: {issueDate}</p>
          <p style={{ fontSize: "13px", color: "#666" }}>Expires: {expiryDate}</p>
        </div>
      </div>

      {customerEngine && (
        <div style={{ backgroundColor: "#f8f8f8", padding: "12px 16px", borderRadius: "6px", marginBottom: "16px", display: "flex", flexWrap: "wrap", gap: "32px", fontSize: "13px", borderLeft: "3px solid #e20404" }}>
          {customerEngine.eed_id && <div><span style={{ color: "#666", textTransform: "uppercase", fontSize: "11px" }}>EED ID</span><br /><strong style={{ fontFamily: "monospace", color: "#e20404" }}>{customerEngine.eed_id}</strong></div>}
          {customerEngine.engine_serial_number && <div><span style={{ color: "#666", textTransform: "uppercase", fontSize: "11px" }}>Serial #</span><br /><strong>{customerEngine.engine_serial_number}</strong></div>}
          {platform && <div><span style={{ color: "#666", textTransform: "uppercase", fontSize: "11px" }}>Platform</span><br /><strong>{platform.manufacturer} {platform.name}{platform.year_range_start ? ` (${platform.year_range_start}${platform.year_range_end ? `–${platform.year_range_end}` : "+"})` : ""}</strong></div>}
          {customerEngine.current_stage && <div><span style={{ color: "#666", textTransform: "uppercase", fontSize: "11px" }}>Stage</span><br /><strong>{STAGE_LABELS[customerEngine.current_stage] || customerEngine.current_stage}</strong></div>}
          {specSheet && <div><span style={{ color: "#666", textTransform: "uppercase", fontSize: "11px" }}>Spec</span><br /><strong>{specSheet.custom_name || STAGE_LABELS[specSheet.spec_type] || specSheet.spec_type}</strong></div>}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "24px" }}>
        <div>
          <h2 style={{ fontSize: "14px", fontWeight: "bold", textTransform: "uppercase", color: "#666", marginBottom: "8px" }}>Bill To</h2>
          <p style={{ fontSize: "15px", fontWeight: "600", marginBottom: "4px" }}>{customer.first_name} {customer.last_name}</p>
          {customer.company_name && <p style={{ fontSize: "14px", color: "#666", marginBottom: "4px" }}>{customer.company_name}</p>}
          <p style={{ fontSize: "14px", color: "#666" }}>{customerAddress}</p>
        </div>
        <div style={{ backgroundColor: "#f8f8f8", padding: "16px", borderRadius: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span>Subtotal:</span>
            <span>${Number(estimate.subtotal || 0).toFixed(2)}</span>
          </div>
          {Number(estimate.tax_amount) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span>Tax ({estimate.tax_rate}%):</span>
              <span>${Number(estimate.tax_amount || 0).toFixed(2)}</span>
            </div>
          )}
          <div style={{ borderTop: "2px solid #e20404", paddingTop: "8px", marginTop: "8px", display: "flex", justifyContent: "space-between", fontSize: "16px", fontWeight: "bold" }}>
            <span>TOTAL ESTIMATE:</span>
            <span>${Number(estimate.total || 0).toFixed(2)}</span>
          </div>
          {estimate.deposit_required && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", borderTop: "1px solid #ddd", paddingTop: "8px" }}>
                <span>Deposit Required:</span>
                <span style={{ fontWeight: "bold" }}>${Number(estimate.deposit_amount || 0).toFixed(2)}</span>
              </div>
              {totalDepositReceived > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", color: "#22c55e" }}>
                  <span>Deposit Paid:</span>
                  <span>-${totalDepositReceived.toFixed(2)}</span>
                </div>
              )}
              {depositRemaining > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", color: "#e20404" }}>
                  <span style={{ fontWeight: "bold" }}>DUE NOW:</span>
                  <span style={{ fontWeight: "bold" }}>${depositRemaining.toFixed(2)}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ marginBottom: "24px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ backgroundColor: "#f8f8f8" }}>
              <th style={{ textAlign: "left", padding: "8px", borderBottom: "2px solid #e20404" }}>Description</th>
              <th style={{ textAlign: "center", padding: "8px", borderBottom: "2px solid #e20404", width: "60px" }}>Qty</th>
              <th style={{ textAlign: "right", padding: "8px", borderBottom: "2px solid #e20404", width: "100px" }}>Unit Price</th>
              <th style={{ textAlign: "right", padding: "8px", borderBottom: "2px solid #e20404", width: "100px" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {(estimate.line_items || []).map((item, idx) => (
              <tr key={idx}>
                <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>{item.item_name} {item.part_number && `(${item.part_number})`}</td>
                <td style={{ textAlign: "center", padding: "8px", borderBottom: "1px solid #eee" }}>{item.quantity}</td>
                <td style={{ textAlign: "right", padding: "8px", borderBottom: "1px solid #eee" }}>${Number(item.unit_price).toFixed(2)}</td>
                <td style={{ textAlign: "right", padding: "8px", borderBottom: "1px solid #eee" }}>${Number(item.total).toFixed(2)}</td>
              </tr>
            ))}
            {(estimate.labor_items || []).map((item, idx) => (
              <tr key={`labor-${idx}`}>
                <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>{item.name} {item.description && `(${item.description})`}</td>
                <td style={{ textAlign: "center", padding: "8px", borderBottom: "1px solid #eee" }}>1</td>
                <td style={{ textAlign: "right", padding: "8px", borderBottom: "1px solid #eee" }}>${Number(item.price).toFixed(2)}</td>
                <td style={{ textAlign: "right", padding: "8px", borderBottom: "1px solid #eee" }}>${Number(item.price).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {estimate.notes && (
        <div style={{ marginBottom: "24px", backgroundColor: "#fafafa", padding: "12px", borderRadius: "4px" }}>
          <h3 style={{ fontSize: "12px", fontWeight: "bold", textTransform: "uppercase", color: "#666", marginBottom: "6px" }}>Notes</h3>
          <p style={{ fontSize: "12px", lineHeight: "1.5", whiteSpace: "pre-wrap", margin: 0 }}>{estimate.notes}</p>
        </div>
      )}

      <div style={{ marginTop: "32px", paddingTop: "16px", borderTop: "1px solid #ddd", textAlign: "center", fontSize: "11px", color: "#999" }}>
        <p>Thank you for considering our services!</p>
        <p>{settings?.company_name} | {settings?.company_website}</p>
        <p style={{ marginTop: "4px" }}>Terms &amp; Conditions: <a href="https://www.eliteenginedevelopment.com/legal" style={{ color: "#999" }}>https://www.eliteenginedevelopment.com/legal</a></p>
      </div>
    </div>
  );
}