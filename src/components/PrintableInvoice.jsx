import React from "react";

import { getCountryName } from "@/components/CountrySelect";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png";

const STAGE_LABELS = { stock: "Stock", stage_1: "Stage 1", stage_2: "Stage 2", stage_3: "Stage 3", contract: "Contract", custom: "Custom" };

export default function PrintableInvoice({ invoice, customer, settings, customerEngine, platform, specSheet }) {
  if (!invoice || !customer) return null;

  const invoiceDate = invoice.issue_date ? new Date(invoice.issue_date).toLocaleDateString() : "N/A";
  const dueDate = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : "N/A";

  const customerAddress = [customer.address_line1, customer.address_line2, customer.city ? `${customer.city}, ${customer.state} ${customer.zip}` : null, customer.country ? getCountryName(customer.country) : null, customer.phone, customer.email].filter(Boolean).join(" | ");

  const hasLabor = (invoice.labor_items || []).length > 0;
  const hasMachining = (invoice.machining_items || []).length > 0;

  return (
    <div className="invoice-page" style={{ fontFamily: "Arial, sans-serif", color: "#333" }}>
      {/* Header */}
      <div className="inv-header">
        <div>
          <img src={LOGO_URL} alt={settings?.company_name} style={{ height: "50px", marginBottom: "6px" }} />
          <h1 style={{ fontSize: "24px", fontWeight: "bold", margin: 0, color: "#1a1a1a" }}>INVOICE</h1>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: "18px", fontWeight: "bold", color: "#e20404", marginBottom: "2px" }}>#{invoice.invoice_number}</p>
          <p style={{ fontSize: "12px", color: "#666" }}>Date: {invoiceDate}</p>
          <p style={{ fontSize: "12px", color: "#666" }}>Due: {dueDate}</p>
        </div>
      </div>

      {/* Engine Details */}
      {customerEngine && (
        <div className="inv-engine-bar">
          {customerEngine.eed_id && <div><span className="lbl">EED ID</span><br /><strong style={{ fontFamily: "monospace", color: "#e20404" }}>{customerEngine.eed_id}</strong></div>}
          {customerEngine.engine_serial_number && <div><span className="lbl">Serial #</span><br /><strong>{customerEngine.engine_serial_number}</strong></div>}
          {platform && <div><span className="lbl">Platform</span><br /><strong>{platform.manufacturer} {platform.name}{platform.year_range_start ? ` (${platform.year_range_start}${platform.year_range_end ? `–${platform.year_range_end}` : "+"})` : ""}</strong></div>}
          {customerEngine.current_stage && <div><span className="lbl">Stage</span><br /><strong>{STAGE_LABELS[customerEngine.current_stage] || customerEngine.current_stage}</strong></div>}
          {specSheet && <div><span className="lbl">Version</span><br /><strong>v{specSheet.version ?? "—"}</strong></div>}
        </div>
      )}

      {/* Bill To */}
      <div className="inv-billto">
        <h2 style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase", color: "#666", marginBottom: "4px" }}>Bill To</h2>
        <p style={{ fontSize: "13px", fontWeight: "600", marginBottom: "2px" }}>{customer.first_name} {customer.last_name}</p>
        {customer.company_name && <p style={{ fontSize: "12px", color: "#666", marginBottom: "2px" }}>{customer.company_name}</p>}
        <p style={{ fontSize: "11px", color: "#666" }}>{customerAddress}</p>
      </div>

      {/* Line Items Table */}
      <table className="inv-items-table">
        <thead>
          <tr>
            <th>Description</th>
            <th className="inv-col-qty">Qty</th>
            <th className="inv-col-price">Unit Price</th>
            <th className="inv-col-total">Total</th>
          </tr>
        </thead>
        <tbody>
          {(invoice.line_items || []).map((item, idx) => (
            <tr key={`part-${idx}`}>
              <td>{item.item_name}</td>
              <td className="inv-center">{item.quantity}</td>
              <td className="inv-right">${Number(item.unit_price).toFixed(2)}</td>
              <td className="inv-right">${Number(item.total).toFixed(2)}</td>
            </tr>
          ))}
          {hasLabor && (
            <tr className="inv-section-row">
              <td colSpan={4}>Labor</td>
            </tr>
          )}
          {(invoice.labor_items || []).map((item, idx) => (
            <tr key={`labor-${idx}`}>
              <td>{item.name} {item.description && `— ${item.description}`}</td>
              <td className="inv-center">1</td>
              <td className="inv-right">${Number(item.price).toFixed(2)}</td>
              <td className="inv-right">${Number(item.price).toFixed(2)}</td>
            </tr>
          ))}
          {hasMachining && (
            <tr className="inv-section-row">
              <td colSpan={4}>Machining</td>
            </tr>
          )}
          {(invoice.machining_items || []).map((item, idx) => (
            <tr key={`machining-${idx}`}>
              <td>{item.name} {item.description && `— ${item.description}`}</td>
              <td className="inv-center">1</td>
              <td className="inv-right">${Number(item.price).toFixed(2)}</td>
              <td className="inv-right">${Number(item.price).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Bottom: Notes (left) + Financial summary (right) */}
      <div className="inv-bottom">
        {invoice.notes ? (
          <div className="inv-notes">
            <h3 style={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", color: "#666", marginBottom: "4px" }}>Notes</h3>
            <p style={{ fontSize: "10px", lineHeight: "1.4", whiteSpace: "pre-wrap", margin: 0 }}>{invoice.notes}</p>
          </div>
        ) : <div />}

        <div className="inv-totals">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span>Subtotal:</span>
            <span>${Number(invoice.subtotal || 0).toFixed(2)}</span>
          </div>
          {Number(invoice.tax_amount) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span>Tax ({invoice.tax_rate}%):</span>
              <span>${Number(invoice.tax_amount || 0).toFixed(2)}</span>
            </div>
          )}
          {Number(invoice.discount_amount) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", color: "#22c55e" }}>
              <span>Discount:</span>
              <span>-${Number(invoice.discount_amount).toFixed(2)}</span>
            </div>
          )}
          {Number(invoice.shipping_cost) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span>Shipping:</span>
              <span>${Number(invoice.shipping_cost || 0).toFixed(2)}</span>
            </div>
          )}
          <div className="inv-total-due">
            <span>TOTAL DUE:</span>
            <span>${Number(invoice.total || 0).toFixed(2)}</span>
          </div>
          {Number(invoice.applied_credits) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", color: "#7c3aed", fontWeight: "600" }}>
              <span>Account Credit Applied:</span>
              <span>-${Number(invoice.applied_credits).toFixed(2)}</span>
            </div>
          )}
          {Number(invoice.amount_paid) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", color: "#3c763d" }}>
              <span>Paid:</span>
              <span>-${Number(invoice.amount_paid).toFixed(2)}</span>
            </div>
          )}
          {Number(invoice.balance_due) > 0 && (
            <div className="inv-balance">
              <span style={{ fontWeight: "bold" }}>BALANCE:</span>
              <span style={{ fontWeight: "bold" }}>${Number(invoice.balance_due).toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="inv-footer">
        <p>Thank you for your business!</p>
        <p>{settings?.company_name} | {settings?.company_website}</p>
        <p style={{ marginTop: "2px" }}>Terms &amp; Conditions: <a href="https://www.eliteenginedevelopment.com/legal" style={{ color: "#999" }}>https://www.eliteenginedevelopment.com/legal</a></p>
      </div>
    </div>
  );
}