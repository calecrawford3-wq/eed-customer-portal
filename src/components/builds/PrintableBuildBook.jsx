import React from "react";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png";

const SPEC_TYPES = [
  { value: "stock", label: "Stock" }, { value: "stage_1", label: "Stage 1" },
  { value: "stage_2", label: "Stage 2" }, { value: "stage_3", label: "Stage 3" },
  { value: "contract", label: "Contract" }, { value: "custom", label: "Custom" },
];

const sectionTitle = (label) => ({
  fontSize: "13px", fontWeight: "bold", textTransform: "uppercase",
  color: "#e20404", borderBottom: "1px solid #ddd", paddingBottom: "6px",
  marginBottom: "10px", marginTop: "20px",
});

const card = { padding: "10px", backgroundColor: "#fff", border: "1px solid #ddd", borderRadius: "4px" };
const labelStyle = { fontSize: "10px", color: "#666", textTransform: "uppercase", marginBottom: "2px" };
const valueStyle = { fontSize: "14px", fontWeight: "600" };

export default function PrintableBuildBook({
  build, platform, specSheet, customer, job, tasks = [], findings = [],
  replacements = [], profitability = null, invoice = null, findingPhotos = {},
}) {
  const getSpecTypeLabel = (type) => SPEC_TYPES.find(t => t.value === type)?.label || type || "N/A";

  const completedTasks = tasks.filter(t => t.status === "complete");
  const totalTasks = tasks.length;
  const taskProgress = totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0;

  // Group tasks by stage
  const tasksByStage = {};
  tasks.forEach(t => {
    const stage = t.stage || "Other";
    if (!tasksByStage[stage]) tasksByStage[stage] = [];
    tasksByStage[stage].push(t);
  });

  // Collect all photos
  const allPhotos = tasks
    .filter(t => t.photos && t.photos.length > 0)
    .flatMap(t => (t.photos || []).map(url => ({ url, taskName: t.name, stage: t.stage })));

  const fmtMoney = (v) => v != null ? `$${Number(v).toFixed(2)}` : "—";
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-US") : "—";

  return (
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: "800px", margin: "0 auto", padding: "20px" }}>
      {/* === COVER PAGE === */}
      <div style={{ borderBottom: "3px solid #e20404", paddingBottom: "16px", marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <img src={LOGO_URL} alt="EED" style={{ height: "50px", marginBottom: "8px" }} />
            <h1 style={{ fontSize: "22px", fontWeight: "bold", margin: 0, color: "#1a1a1a" }}>
              BUILD BOOK
            </h1>
            <p style={{ fontSize: "13px", color: "#666", marginTop: "4px" }}>
              Complete Build Documentation & Traceability Record
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ backgroundColor: "#e20404", color: "white", padding: "10px 20px",
              borderRadius: "6px", fontWeight: "bold", fontSize: "18px",
              WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
              {getSpecTypeLabel(specSheet?.spec_type)}
            </div>
            {job?.job_number && <p style={{ fontSize: "12px", color: "#666", marginTop: "6px" }}>{job.job_number}</p>}
          </div>
        </div>
      </div>

      {/* === BUILD SUMMARY === */}
      <div style={{ backgroundColor: "#f8f8f8", padding: "14px", borderRadius: "8px", marginBottom: "16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div>
            <div style={labelStyle}>Customer</div>
            <div style={valueStyle}>{customer ? `${customer.first_name} ${customer.last_name}` : build.customer_name || "—"}</div>
          </div>
          <div>
            <div style={labelStyle}>Engine Serial Number</div>
            <div style={valueStyle}>{build.engine_serial_number}</div>
          </div>
          <div>
            <div style={labelStyle}>EED ID</div>
            <div style={{ ...valueStyle, fontFamily: "monospace", color: "#e20404" }}>{build.eed_id || "—"}</div>
          </div>
          <div>
            <div style={labelStyle}>Platform</div>
            <div style={valueStyle}>
              {platform ? `${platform.manufacturer} ${platform.name}` : "—"}
              {platform?.displacement_cc ? ` · ${platform.displacement_cc}cc` : ""}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Build Number</div>
            <div style={valueStyle}>{build.build_number || "—"}</div>
          </div>
          <div>
            <div style={labelStyle}>Status</div>
            <div style={valueStyle}>{build.status?.replace("_", " ") || "—"}</div>
          </div>
          <div>
            <div style={labelStyle}>Start Date</div>
            <div style={valueStyle}>{fmtDate(build.start_date)}</div>
          </div>
          <div>
            <div style={labelStyle}>Completion Date</div>
            <div style={valueStyle}>{fmtDate(build.completion_date)}</div>
          </div>
        </div>
      </div>

      {/* === ENGINE SPECIFICATIONS === */}
      <h2 style={sectionTitle("Engine Specifications")}>
        Engine Specifications
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "16px" }}>
        <div style={card}>
          <div style={labelStyle}>Bore</div>
          <div style={valueStyle}>{specSheet?.specs?.block?.bore_diameter_mm || "—"} mm</div>
        </div>
        <div style={card}>
          <div style={labelStyle}>Stroke</div>
          <div style={valueStyle}>{specSheet?.specs?.rotating_assembly?.stroke_mm || "—"} mm</div>
        </div>
        <div style={card}>
          <div style={labelStyle}>Max RPM</div>
          <div style={valueStyle}>{build.max_rpm?.toLocaleString() || "—"}</div>
        </div>
      </div>

      {/* === MAINTENANCE === */}
      <h2 style={sectionTitle("Maintenance & Service")}>
        Maintenance & Service
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px", marginBottom: "16px" }}>
        <div style={card}>
          <div style={labelStyle}>Refresh Interval</div>
          <div style={valueStyle}>{build.refresh_interval || "—"}</div>
        </div>
        <div style={card}>
          <div style={labelStyle}>Oil Change Interval</div>
          <div style={valueStyle}>{build.oil_change_interval || "—"}</div>
        </div>
        <div style={card}>
          <div style={labelStyle}>Recommended Oil</div>
          <div style={valueStyle}>{build.oil_recommendation || "—"}</div>
        </div>
        <div style={card}>
          <div style={labelStyle}>Spark Plug</div>
          <div style={valueStyle}>{build.spark_plug_recommendation || "—"}</div>
        </div>
      </div>

      {/* === VALVE LASH === */}
      <h2 style={sectionTitle("Valve Lash Settings")}>
        Valve Lash Settings
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
        {["intake", "exhaust"].map(type => (
          <div key={type}>
            <div style={{ fontSize: "11px", fontWeight: "600", marginBottom: "6px", color: "#333", textTransform: "uppercase" }}>
              {type}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[1,2,3,4,5,6,7,8].map(n => (
                    <th key={n} style={{ padding: "4px", backgroundColor: "#f0f0f0", border: "1px solid #ddd", fontSize: "10px" }}>#{n}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {[1,2,3,4,5,6,7,8].map(n => (
                    <td key={n} style={{ padding: "6px", border: "1px solid #ddd", textAlign: "center", fontSize: "11px" }}>
                      {build[`valve_lash_${type}`]?.[`valve_${n}`] || "—"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* === CAM INFO === */}
      {build.cam_info && (build.cam_info.intake_direction || build.cam_info.exhaust_direction) && (
        <>
          <h2 style={sectionTitle("Camshaft Timing")}>
            Camshaft Timing
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
            <div style={card}>
              <div style={labelStyle}>Intake</div>
              <div style={valueStyle}>
                {build.cam_info.intake_direction ? `${build.cam_info.intake_direction} ${build.cam_info.intake_degrees || 0}°` : "—"}
              </div>
            </div>
            <div style={card}>
              <div style={labelStyle}>Exhaust</div>
              <div style={valueStyle}>
                {build.cam_info.exhaust_direction ? `${build.cam_info.exhaust_direction} ${build.cam_info.exhaust_degrees || 0}°` : "—"}
              </div>
            </div>
          </div>
        </>
      )}

      {/* === BUILD TASK LOG === */}
      {totalTasks > 0 && (
        <>
          <h2 style={sectionTitle("Build Task Log")}>
            Build Task Log ({completedTasks.length}/{totalTasks} complete · {taskProgress}%)
          </h2>
          <div style={{ marginBottom: "16px" }}>
            {Object.entries(tasksByStage).map(([stage, stageTasks]) => (
              <div key={stage} style={{ marginBottom: "12px" }}>
                <div style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase", color: "#666", marginBottom: "4px", borderBottom: "1px solid #eee", paddingBottom: "3px" }}>
                  {stage}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#fafafa" }}>
                      <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #ddd" }}>Task</th>
                      <th style={{ textAlign: "center", padding: "4px 6px", borderBottom: "1px solid #ddd", width: "70px" }}>Status</th>
                      <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #ddd", width: "120px" }}>Completed By</th>
                      <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #ddd", width: "80px" }}>Date</th>
                      <th style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #ddd" }}>Measurements</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stageTasks.map(t => (
                      <tr key={t.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <td style={{ padding: "4px 6px" }}>{t.name}</td>
                        <td style={{ padding: "4px 6px", textAlign: "center" }}>
                          {t.status === "complete" ? "✓" : t.status === "skipped" ? "—" : t.status === "in_progress" ? "►" : "○"}
                        </td>
                        <td style={{ padding: "4px 6px", fontSize: "10px", color: "#666" }}>{t.completed_by || "—"}</td>
                        <td style={{ padding: "4px 6px", fontSize: "10px", color: "#666" }}>{fmtDate(t.completed_at)}</td>
                        <td style={{ padding: "4px 6px", fontSize: "10px", color: "#666" }}>{t.measurements || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}

      {/* === TEARDOWN FINDINGS === */}
      {findings.length > 0 && (
        <>
          <h2 style={sectionTitle("Teardown & Inspection Findings")}>
            Teardown & Inspection Findings
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginBottom: "16px" }}>
            <thead>
              <tr style={{ backgroundColor: "#fafafa" }}>
                <th style={{ textAlign: "left", padding: "5px 8px", borderBottom: "2px solid #e20404" }}>Component</th>
                <th style={{ textAlign: "left", padding: "5px 8px", borderBottom: "2px solid #e20404" }}>Condition</th>
                <th style={{ textAlign: "left", padding: "5px 8px", borderBottom: "2px solid #e20404" }}>Measurements</th>
                <th style={{ textAlign: "left", padding: "5px 8px", borderBottom: "2px solid #e20404" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {findings.map(f => (
                <tr key={f.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "5px 8px", fontWeight: "600" }}>{f.component}</td>
                  <td style={{ padding: "5px 8px", textTransform: "capitalize" }}>{f.condition?.replace("_", " ") || "—"}</td>
                  <td style={{ padding: "5px 8px", fontSize: "10px", color: "#666" }}>{f.measurements || "—"}</td>
                  <td style={{ padding: "5px 8px", textTransform: "capitalize" }}>{f.recommended_action && f.recommended_action !== "none" ? f.recommended_action : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* === COMPONENT REPLACEMENTS === */}
      {replacements.length > 0 && (
        <>
          <h2 style={sectionTitle("Components Replaced")}>
            Components Replaced During This Build
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
            {replacements.map(r => (
              <span key={r.id} style={{ backgroundColor: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0",
                padding: "4px 10px", borderRadius: "4px", fontSize: "11px", fontWeight: "500" }}>
                ✓ {r.component}
              </span>
            ))}
          </div>
        </>
      )}

      {/* === PROGRESS PHOTOS === */}
      {allPhotos.length > 0 && (
        <>
          <h2 style={sectionTitle("Build Progress Photos")}>
            Build Progress Photos ({allPhotos.length})
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px", marginBottom: "16px" }}>
            {allPhotos.map((photo, idx) => (
              <div key={idx} style={{ border: "1px solid #ddd", borderRadius: "4px", overflow: "hidden" }}>
                <img src={photo.url} alt={photo.taskName} style={{ width: "100%", height: "120px", objectFit: "cover", display: "block" }} />
                <div style={{ padding: "3px 5px", fontSize: "9px", color: "#666", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {photo.taskName}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* === FINDING PHOTOS === */}
      {(() => {
        const findingsWithPhotos = findings.filter(f => (findingPhotos[f.id] || []).length > 0);
        if (findingsWithPhotos.length === 0) return null;
        const totalPhotos = findingsWithPhotos.reduce((n, f) => n + (findingPhotos[f.id] || []).length, 0);
        return (
          <>
            <h2 style={sectionTitle("Inspection Finding Photos")}>
              Inspection Finding Photos ({totalPhotos})
            </h2>
            <div style={{ marginBottom: "16px" }}>
              {findingsWithPhotos.map(f => {
                const photos = findingPhotos[f.id] || [];
                return (
                  <div key={f.id} style={{ marginBottom: "14px", breakInside: "avoid" }}>
                    <div style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase", color: "#666", marginBottom: "4px", borderBottom: "1px solid #eee", paddingBottom: "3px" }}>
                      {f.component} · {photos.length} photo{photos.length === 1 ? "" : "s"}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px" }}>
                      {photos.map((photo, idx) => (
                        <div key={photo.id || idx} style={{ border: "1px solid #ddd", borderRadius: "4px", overflow: "hidden", breakInside: "avoid" }}>
                          <img src={photo.signed_url} alt={photo.caption || f.component} style={{ width: "100%", height: "120px", objectFit: "cover", display: "block" }} />
                          {photo.caption && (
                            <div style={{ padding: "3px 5px", fontSize: "9px", color: "#666", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {photo.caption}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* === ASSEMBLY NOTES === */}
      {build.assembly_notes && (
        <>
          <h2 style={sectionTitle("Assembly Notes")}>
            Assembly Notes
          </h2>
          <div style={{ padding: "12px", backgroundColor: "#fff", border: "1px solid #ddd", borderRadius: "4px",
            fontSize: "12px", lineHeight: "1.6", whiteSpace: "pre-wrap", marginBottom: "16px" }}>
            {build.assembly_notes}
          </div>
        </>
      )}

      {/* === PROFITABILITY SNAPSHOT (admin only) === */}
      {profitability && (
        <>
          <h2 style={sectionTitle("Job Profitability Summary")}>
            Job Profitability Summary (Internal)
          </h2>
          <div style={{ backgroundColor: "#f8f8f8", padding: "12px", borderRadius: "6px", marginBottom: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "11px" }}>
              <div><strong>Revenue:</strong> {fmtMoney(profitability.revenue)}</div>
              <div><strong>Parts Cost:</strong> {fmtMoney(profitability.parts_cost)}</div>
              <div><strong>Labor Hours:</strong> {profitability.labor_hours || 0}h</div>
              <div><strong>Labor Cost:</strong> {fmtMoney(profitability.labor_cost)}</div>
              <div><strong>Machining Cost:</strong> {fmtMoney(profitability.machining_cost)}</div>
              <div><strong>Gross Margin:</strong> {fmtMoney(profitability.gross_margin)}</div>
              <div><strong>Margin %:</strong> {profitability.margin_pct != null ? `${profitability.margin_pct}%` : "—"}</div>
              {profitability.warranty_cost > 0 && <div><strong>Warranty Cost:</strong> {fmtMoney(profitability.warranty_cost)}</div>}
            </div>
          </div>
        </>
      )}

      {/* === INVOICE SUMMARY === */}
      {invoice && (
        <>
          <h2 style={sectionTitle("Invoice Summary")}>
            Invoice Summary
          </h2>
          <div style={{ backgroundColor: "#f8f8f8", padding: "12px", borderRadius: "6px", marginBottom: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "11px" }}>
              <div><strong>Invoice #:</strong> {invoice.invoice_number}</div>
              <div><strong>Issue Date:</strong> {fmtDate(invoice.issue_date)}</div>
              <div><strong>Subtotal:</strong> {fmtMoney(invoice.subtotal)}</div>
              <div><strong>Tax:</strong> {fmtMoney(invoice.tax_amount)}</div>
              <div><strong>Total:</strong> {fmtMoney(invoice.total)}</div>
              <div><strong>Paid:</strong> {fmtMoney(invoice.amount_paid)}</div>
              <div><strong>Balance:</strong> {fmtMoney(invoice.balance_due)}</div>
              <div><strong>Status:</strong> {invoice.status}</div>
            </div>
          </div>
        </>
      )}

      {/* === FOOTER === */}
      <div style={{ marginTop: "24px", paddingTop: "12px", borderTop: "1px solid #ddd",
        display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#999" }}>
        <div>Build Book generated {new Date().toLocaleDateString()} · {job?.job_number || build.build_number || ""}</div>
        <div>Elite Engine Development · {build.eed_id || build.engine_serial_number}</div>
      </div>
    </div>
  );
}