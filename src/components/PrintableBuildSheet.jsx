import React from "react";

const SPEC_TYPES = [
  { value: "stock", label: "Stock" },
  { value: "stage_1", label: "Stage 1" },
  { value: "stage_2", label: "Stage 2" },
  { value: "stage_3", label: "Stage 3" },
  { value: "contract", label: "Contract" },
  { value: "custom", label: "Custom" },
];

export default function PrintableBuildSheet({ build, platform, specSheet }) {
  const getSpecTypeLabel = (type) => SPEC_TYPES.find(t => t.value === type)?.label || type;

  const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png";

  return (
    <div style={{ fontFamily: "Arial, sans-serif", padding: "24px", maxWidth: "800px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ borderBottom: "3px solid #e20404", paddingBottom: "16px", marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <img src={LOGO_URL} alt="Elite Engine Development" style={{ height: "60px", marginBottom: "8px" }} />
            <h1 style={{ fontSize: "24px", fontWeight: "bold", margin: 0, color: "#1a1a1a" }}>
              ENGINE BUILD SHEET
            </h1>
            <p style={{ fontSize: "14px", color: "#666", marginTop: "4px" }}>
              {platform?.manufacturer} {platform?.name} • {platform?.displacement_cc}cc
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ 
              backgroundColor: "#e20404", 
              color: "white", 
              padding: "8px 16px", 
              borderRadius: "4px",
              fontWeight: "bold",
              fontSize: "18px"
            }}>
              {specSheet ? getSpecTypeLabel(specSheet.spec_type) : "N/A"}
            </div>
          </div>
        </div>
      </div>

      {/* Customer & Build Info */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "1fr 1fr", 
        gap: "16px", 
        marginBottom: "24px",
        backgroundColor: "#f8f8f8",
        padding: "16px",
        borderRadius: "8px"
      }}>
        <div>
          <div style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", marginBottom: "4px" }}>
            Customer Name
          </div>
          <div style={{ fontSize: "16px", fontWeight: "600" }}>
            {build.customer_name || "—"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", marginBottom: "4px" }}>
            Engine Serial Number
          </div>
          <div style={{ fontSize: "16px", fontWeight: "600" }}>
            {build.engine_serial_number}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", marginBottom: "4px" }}>
            Build/Jobcard #
          </div>
          <div style={{ fontSize: "16px", fontWeight: "600" }}>
            {build.build_number || "—"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", marginBottom: "4px" }}>
            Invoice Number
          </div>
          <div style={{ fontSize: "16px", fontWeight: "600" }}>
            {build.invoice_number || "—"}
          </div>
        </div>
        {build.transmission_type && (
          <div>
            <div style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", marginBottom: "4px" }}>
              Transmission Type
            </div>
            <div style={{ fontSize: "16px", fontWeight: "600" }}>
              {build.transmission_type}
            </div>
          </div>
        )}
      </div>

      {/* Engine Specs */}
      <div style={{ marginBottom: "24px" }}>
        <h2 style={{ 
          fontSize: "14px", 
          fontWeight: "bold", 
          textTransform: "uppercase", 
          color: "#e20404",
          borderBottom: "1px solid #ddd",
          paddingBottom: "8px",
          marginBottom: "12px"
        }}>
          Engine Specifications
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
          <div style={{ padding: "12px", backgroundColor: "#fff", border: "1px solid #ddd", borderRadius: "4px" }}>
            <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>Bore</div>
            <div style={{ fontSize: "18px", fontWeight: "bold" }}>
              {specSheet?.specs?.block?.bore_diameter_mm || "—"} mm
            </div>
          </div>
          <div style={{ padding: "12px", backgroundColor: "#fff", border: "1px solid #ddd", borderRadius: "4px" }}>
            <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>Stroke</div>
            <div style={{ fontSize: "18px", fontWeight: "bold" }}>
              {specSheet?.specs?.rotating_assembly?.stroke_mm || "—"} mm
            </div>
          </div>
          <div style={{ padding: "12px", backgroundColor: "#fff", border: "1px solid #ddd", borderRadius: "4px" }}>
            <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>Max RPM</div>
            <div style={{ fontSize: "18px", fontWeight: "bold" }}>
              {build.max_rpm?.toLocaleString() || "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Maintenance Info */}
      <div style={{ marginBottom: "24px" }}>
        <h2 style={{ 
          fontSize: "14px", 
          fontWeight: "bold", 
          textTransform: "uppercase", 
          color: "#e20404",
          borderBottom: "1px solid #ddd",
          paddingBottom: "8px",
          marginBottom: "12px"
        }}>
          Maintenance & Service
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
          <div style={{ padding: "12px", backgroundColor: "#fff", border: "1px solid #ddd", borderRadius: "4px" }}>
            <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>Refresh Interval</div>
            <div style={{ fontSize: "14px", fontWeight: "600" }}>{build.refresh_interval || "—"}</div>
          </div>
          <div style={{ padding: "12px", backgroundColor: "#fff", border: "1px solid #ddd", borderRadius: "4px" }}>
            <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>Oil Change Interval</div>
            <div style={{ fontSize: "14px", fontWeight: "600" }}>{build.oil_change_interval || "—"}</div>
          </div>
          <div style={{ padding: "12px", backgroundColor: "#fff", border: "1px solid #ddd", borderRadius: "4px" }}>
            <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>Recommended Oil</div>
            <div style={{ fontSize: "14px", fontWeight: "600" }}>{build.oil_recommendation || "—"}</div>
          </div>
          <div style={{ padding: "12px", backgroundColor: "#fff", border: "1px solid #ddd", borderRadius: "4px" }}>
            <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>Spark Plug</div>
            <div style={{ fontSize: "14px", fontWeight: "600" }}>{build.spark_plug_recommendation || "—"}</div>
          </div>
        </div>
      </div>

      {/* Valve Lash */}
      <div style={{ marginBottom: "24px" }}>
        <h2 style={{ 
          fontSize: "14px", 
          fontWeight: "bold", 
          textTransform: "uppercase", 
          color: "#e20404",
          borderBottom: "1px solid #ddd",
          paddingBottom: "8px",
          marginBottom: "12px"
        }}>
          Valve Lash Settings
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          {/* Intake */}
          <div>
            <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "8px", color: "#333" }}>
              INTAKE
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                    <th key={n} style={{ 
                      padding: "6px", 
                      backgroundColor: "#f0f0f0", 
                      border: "1px solid #ddd",
                      fontSize: "11px",
                      fontWeight: "600"
                    }}>
                      #{n}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                    <td key={n} style={{ 
                      padding: "8px", 
                      border: "1px solid #ddd", 
                      textAlign: "center",
                      fontSize: "12px",
                      fontWeight: "500"
                    }}>
                      {build.valve_lash_intake?.[`valve_${n}`] || "—"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {/* Exhaust */}
          <div>
            <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "8px", color: "#333" }}>
              EXHAUST
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                    <th key={n} style={{ 
                      padding: "6px", 
                      backgroundColor: "#f0f0f0", 
                      border: "1px solid #ddd",
                      fontSize: "11px",
                      fontWeight: "600"
                    }}>
                      #{n}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                    <td key={n} style={{ 
                      padding: "8px", 
                      border: "1px solid #ddd", 
                      textAlign: "center",
                      fontSize: "12px",
                      fontWeight: "500"
                    }}>
                      {build.valve_lash_exhaust?.[`valve_${n}`] || "—"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Notes */}
      {build.assembly_notes && (
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ 
            fontSize: "14px", 
            fontWeight: "bold", 
            textTransform: "uppercase", 
            color: "#e20404",
            borderBottom: "1px solid #ddd",
            paddingBottom: "8px",
            marginBottom: "12px"
          }}>
            Notes & Comments
          </h2>
          <div style={{ 
            padding: "16px", 
            backgroundColor: "#fff", 
            border: "1px solid #ddd", 
            borderRadius: "4px",
            fontSize: "13px",
            lineHeight: "1.6",
            whiteSpace: "pre-wrap"
          }}>
            {build.assembly_notes}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ 
        marginTop: "32px", 
        paddingTop: "16px", 
        borderTop: "1px solid #ddd",
        display: "flex",
        justifyContent: "space-between",
        fontSize: "11px",
        color: "#999"
      }}>
        <div>Build Date: {build.start_date || new Date().toISOString().split('T')[0]}</div>
        <div>Printed: {new Date().toLocaleDateString()}</div>
      </div>
    </div>
  );
}