// Shared branded email template for stage comparison emails.
// Used by both the EstimateDetail "Send" button (when the estimate is in a
// comparison group) and the StageComparisonSection "Send to Customer" button.

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png";

export function buildComparisonEmailHtml({ stages, customer, settings = {}, url }) {
  const stageRows = stages
    .map(
      (s) =>
        `<tr><td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #1a1a1a;">${s.comparison_stage_label || `Stage ${s.comparison_sort_order}`}</td><td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #1a1a1a; font-weight: 700;">$${Number(s.total || 0).toFixed(2)}</td></tr>`
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background: #f8f9fa; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
          .header { background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); padding: 40px 32px; text-align: center; border-bottom: 4px solid #e20404; }
          .logo { height: 40px; margin-bottom: 20px; display: inline-block; }
          .header-title { font-size: 32px; font-weight: 700; margin: 12px 0 4px 0; color: #ffffff; }
          .header-subtitle { font-size: 14px; color: #e20404; font-weight: 600; letter-spacing: 1px; margin: 0; }
          .content { padding: 40px 32px; }
          .greeting { font-size: 18px; font-weight: 600; color: #1a1a1a; margin: 0 0 16px 0; }
          .description { font-size: 15px; color: #4a5568; line-height: 1.6; margin: 0 0 24px 0; }
          .stage-table { width: 100%; border-collapse: collapse; margin: 24px 0; background: #f8f9fa; border-radius: 4px; overflow: hidden; }
          .cta-button { display: inline-block; background: #e20404; color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 6px; font-weight: 600; font-size: 16px; margin: 32px 0; transition: background 0.2s; }
          .cta-button:hover { background: #c00303; }
          .cta-wrapper { text-align: center; }
          .footer { background: #f8f9fa; padding: 32px; border-top: 1px solid #e2e8f0; text-align: center; color: #718096; font-size: 13px; line-height: 1.6; }
          .company-info { color: #1a1a1a; font-weight: 600; margin-bottom: 12px; }
          .divider { border-top: 1px solid #e2e8f0; margin: 24px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${LOGO_URL}" alt="${settings.company_name || ""}" class="logo" />
            <h1 class="header-title">Stage Options Ready</h1>
            <p class="header-subtitle">${stages.length} STAGES TO COMPARE</p>
          </div>
          <div class="content">
            <p class="greeting">Hi ${customer?.first_name || ""},</p>
            <p class="description">We've prepared ${stages.length} stage options for your engine build. Compare them side-by-side, see what each stage includes, and choose the one that fits your goals and budget.</p>
            <table class="stage-table">${stageRows}</table>
            <p class="description">Review the detailed breakdown of each stage and approve the one that works for you. You can also mark interest in multiple stages if you'd like to discuss your options with us.</p>
            <div class="cta-wrapper">
              <a href="${url}" class="cta-button">Compare Stages & Choose</a>
            </div>
            <p style="font-size: 13px; color: #718096; text-align: center; margin: 24px 0 0 0;">Can't click? Copy and paste this link: <br/><span style="color: #4a5568; word-break: break-all;">${url}</span></p>
          </div>
          <div class="footer">
            <p class="company-info">${settings.company_name || "Elite Engine Development"}</p>
            ${settings.company_phone ? `<p>${settings.company_phone}</p>` : ""}
            ${settings.company_email ? `<p>${settings.company_email}</p>` : ""}
            <div class="divider"></div>
            <p>${settings.email_signature || "Thank you for your business!"}</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

export function comparisonEmailSubject(stages) {
  return `Your Engine Build Stage Options — ${stages.length} Stages to Compare`;
}