import sgMail from '@sendgrid/mail'
import { env } from '@/config/env'
import { IAnalysis, IPullRequest } from '@/globals/interfaces'
import { logger } from '@/lib/logger'
import puppeteer from 'puppeteer'

sgMail.setApiKey(env.SENDGRID_API_KEY)

export class EmailService {

  private buildHTMLDocument(pr: IPullRequest, analysis: IAnalysis): string {
    const riskColor: Record<string, string> = {
      LOW: '#16a34a',
      MEDIUM: '#d97706',
      HIGH: '#ea580c',
      CRITICAL: '#dc2626',
    }

    const testingSuggestionsHTML = analysis.testingSuggestions
      .map(
        (s) => `
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;word-break:break-word;vertical-align:top;">${s.area}</td>
          <td style="padding:8px;border:1px solid #e5e7eb;word-break:break-word;vertical-align:top;">${s.suggestion}</td>
          <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;vertical-align:top;color:${s.priority === 'HIGH' ? '#dc2626' : s.priority === 'MEDIUM' ? '#d97706' : '#16a34a'
          }">${s.priority}</td>
        </tr>`
      )
      .join('')

    const reviewCommentsHTML = analysis.reviewComments
      .map(
        (c) => `
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;font-family:monospace;font-size:12px;word-break:break-all;vertical-align:top;">${c.file}${c.line ? `:${c.line}` : ''}</td>
          <td style="padding:8px;border:1px solid #e5e7eb;word-break:break-word;vertical-align:top;">${c.comment}</td>
          <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;vertical-align:top;color:${c.severity === 'ERROR' ? '#dc2626' : c.severity === 'WARNING' ? '#d97706' : '#2563eb'
          }">${c.severity}</td>
        </tr>`
      )
      .join('')

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>PR #${pr.prNumber} Analysis Report</title>
</head>
<body style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;color:#111827;">

  <!-- Header -->
  <div style="background:linear-gradient(45deg,#6f20fa,#088cfd);padding:22px;border-radius:12px;margin-bottom:20px;">
   <h1 style="color:white;margin:6px 0 0;font-size:22px;">AI PR Analyzer</h1>
    <p style="color:rgba(255,255,255,0.8);margin:0;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">Pull Request Analysis Report</p>
  </div>

  <!-- PR Info -->
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:20px;">
    <h2 style="margin:0 0 16px;font-size:16px;color:#374151;">📋 PR Information</h2>
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:6px 0;color:#6b7280;width:160px;">PR Number</td>
        <td style="padding:6px 0;font-weight:600;">#${pr.prNumber}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#6b7280;">Author</td>
        <td style="padding:6px 0;">${pr.author}</td>
      </tr>
       <tr>
        <td style="padding:6px 0;color:#6b7280;">Repository</td>
        <td style="padding:6px 0;font-family:monospace;">${pr.repositoryFullName ?? '—'}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#6b7280;">Title</td>
        <td style="padding:6px 0;font-weight:600;">${pr.title}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#6b7280;">Status</td>
        <td style="padding:6px 0;">
          <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#dcfce7;color:#166534;">${pr.status ?? 'DONE'}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#6b7280;">Destination Branch</td>
        <td style="padding:6px 0;"><span style="font-family:monospace;background:#f3f4f6;padding:2px 6px;border-radius:4px;">${pr.baseBranch}</span></td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#6b7280;">Source Branch</td>
        <td style="padding:6px 0;"><span style="font-family:monospace;background:#f3f4f6;padding:2px 6px;border-radius:4px;">${pr.headBranch}</span></td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#6b7280;">Plan & Token used</td>
        <td style="padding:6px 0;">${pr.plan ?? 'FREE'} · ${analysis.tokensUsed.toLocaleString()} tokens</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#6b7280;">Date & Time</td>
        <td style="padding:6px 0;">${new Date(pr.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</td>
      </tr>
      <tr>
  <td style="padding:6px 0;color:#6b7280;">Provider</td>
  <td style="padding:6px 0;">
    <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#e0e7ff;color:#4338ca;text-transform:capitalize;">${pr.provider ?? '—'}</span>
  </td>
</tr>
    </table>
  </div>

  <!-- AI Summary -->
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:20px;">
    <h2 style="margin:0 0 12px;font-size:16px;color:#374151;">💬 AI Summary</h2>
    <p style="margin:0;font-size:14px;color:#4b5563;line-height:1.6;">${analysis.summary}</p>
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
      AI Model: <span style="color:#6b7280;font-weight:600;">${analysis.aiModel}</span> ·
      PR Tokens Consumed: <span style="color:#6b7280;font-weight:600;">${analysis.tokensUsed.toLocaleString()}</span> ·
      Processing Time: <span style="color:#6b7280;font-weight:600;">${typeof analysis.processingTimeMs === 'number' && !isNaN(analysis.processingTimeMs) ? `${(analysis.processingTimeMs / 1000).toFixed(1)}s` : '—'}</span>
    </div>
  </div>

  <!-- Testing Suggestions -->
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:20px;">
    <h2 style="margin:0 0 16px;font-size:16px;color:#374151;">🧪 Testing Suggestions</h2>
    ${analysis.testingSuggestions.length > 0 ? `
    <table style="width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="width:22%;padding:8px;border:1px solid #e5e7eb;text-align:left;">Area</th>
          <th style="width:56%;padding:8px;border:1px solid #e5e7eb;text-align:left;">Suggestion</th>
          <th style="width:22%;padding:8px;border:1px solid #e5e7eb;text-align:left;">Priority</th>
        </tr>
      </thead>
      <tbody>${testingSuggestionsHTML}</tbody>
    </table>` : `<p style="margin:0;font-size:13px;color:#9ca3af;">No specific testing suggestions for this PR.</p>`}
  </div>

  <!-- AI Review Comments -->
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:20px;">
    <h2 style="margin:0 0 16px;font-size:16px;color:#374151;">📝 AI Review Comments</h2>
    ${analysis.reviewComments.length > 0 ? `
    <table style="width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="width:22%;padding:8px;border:1px solid #e5e7eb;text-align:left;">File</th>
          <th style="width:56%;padding:8px;border:1px solid #e5e7eb;text-align:left;">Comment</th>
          <th style="width:22%;padding:8px;border:1px solid #e5e7eb;text-align:left;">Severity</th>
        </tr>
      </thead>
      <tbody>${reviewCommentsHTML}</tbody>
    </table>` : `<p style="margin:0;font-size:13px;color:#9ca3af;">No review comments for this PR.</p>`}
  </div>

  <!-- Blockers / Critical Issues -->
  <div style="background:${analysis.reviewComments.filter(c => c.severity === 'ERROR').length > 0 ? '#fff5f5' : '#f9fafb'};border:${analysis.reviewComments.filter(c => c.severity === 'ERROR').length > 0 ? '2px solid #dc2626' : '1px solid #e5e7eb'};border-radius:8px;padding:20px;margin-bottom:20px;">
    <h2 style="margin:0 0 16px;font-size:16px;color:${analysis.reviewComments.filter(c => c.severity === 'ERROR').length > 0 ? '#dc2626' : '#374151'};">⛔ Blockers & Critical Issues (${analysis.reviewComments.filter(c => c.severity === 'ERROR').length})</h2>
    ${analysis.reviewComments.filter(c => c.severity === 'ERROR').length > 0 ? analysis.reviewComments
        .filter(c => c.severity === 'ERROR')
        .map((c, i) => `
      <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #fecaca;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:bold;color:#374151;">B${i + 1} — ${c.comment.split('.')[0]}</p>
        <div style="background:#1e1e1e;border-radius:6px;padding:10px;margin-bottom:6px;">
          <code style="font-family:monospace;font-size:12px;color:#e5e7eb;">${c.file}${c.line ? `:${c.line}` : ''}</code>
        </div>
        <p style="margin:0;font-size:13px;color:#4b5563;">${c.comment}</p>
      </div>`).join('') : `<p style="margin:0;font-size:13px;color:#16a34a;">No blockers found — this PR looks safe to merge from a blocking-issue perspective.</p>`}
  </div>

  <!-- Warnings -->
  <div style="background:${analysis.reviewComments.filter(c => c.severity === 'WARNING').length > 0 ? '#fffbeb' : '#f9fafb'};border:${analysis.reviewComments.filter(c => c.severity === 'WARNING').length > 0 ? '2px solid #d97706' : '1px solid #e5e7eb'};border-radius:8px;padding:20px;margin-bottom:20px;">
    <h2 style="margin:0 0 16px;font-size:16px;color:${analysis.reviewComments.filter(c => c.severity === 'WARNING').length > 0 ? '#d97706' : '#374151'};">⚠️ Warnings (${analysis.reviewComments.filter(c => c.severity === 'WARNING').length})</h2>
    ${analysis.reviewComments.filter(c => c.severity === 'WARNING').length > 0 ? analysis.reviewComments
        .filter(c => c.severity === 'WARNING')
        .map((c, i) => `
      <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #fde68a;">
        <p style="margin:0 0 4px;font-size:13px;font-weight:bold;color:#374151;">W${i + 1} — ${c.file}${c.line ? `:${c.line}` : ''}</p>
        <p style="margin:0;font-size:13px;color:#4b5563;">${c.comment}</p>
      </div>`).join('') : `<p style="margin:0;font-size:13px;color:#16a34a;">No warnings found for this PR.</p>`}
  </div>

  <!-- Risk Assessment -->
  <div style="background:${riskColor[analysis.riskLevel]}0d;border:2px solid ${riskColor[analysis.riskLevel]};border-radius:8px;padding:20px;margin-bottom:20px;">
    <h2 style="margin:0 0 16px;font-size:16px;color:#374151;">🛡️ Risk Assessment</h2>
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
      <div style="background:#fff;border:2px solid ${riskColor[analysis.riskLevel]};border-radius:8px;padding:12px 24px;text-align:center;">
        <p style="margin:0;font-size:22px;font-weight:bold;color:${riskColor[analysis.riskLevel]};">${analysis.riskLevel}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">Risk Level</p>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px 24px;text-align:center;">
        <p style="margin:0;font-size:22px;font-weight:bold;color:#111827;">${analysis.riskScore}/100</p>
        <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">Risk Score</p>
      </div>
    </div>
    ${analysis.riskReasons.length > 0 ? `
    <div style="margin-top:16px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Risk Reasons:</p>
      <ul style="margin:0;padding-left:20px;">
        ${analysis.riskReasons.map((r) => `<li style="font-size:13px;color:#4b5563;margin-bottom:4px;">${r}</li>`).join('')}
      </ul>
    </div>` : ''}
  </div>

<!-- Merge Verdict -->
<div style="background:${analysis.mergeVerdict === 'READY' ? '#f0fdf4' : analysis.mergeVerdict === 'NEEDS_CHANGES' ? '#fef2f2' : '#fffbeb'};border:2px solid ${analysis.mergeVerdict === 'READY' ? '#16a34a' : analysis.mergeVerdict === 'NEEDS_CHANGES' ? '#dc2626' : '#d97706'};border-radius:8px;padding:20px;margin-bottom:20px;text-align:center;">
  <h2 style="margin:0 0 10px;font-size:16px;color:#374151;">🔀 Merge Verdict</h2>
  <p style="margin:0;font-size:20px;font-weight:bold;color:${analysis.mergeVerdict === 'READY' ? '#16a34a' : analysis.mergeVerdict === 'NEEDS_CHANGES' ? '#dc2626' : '#d97706'};">
    ${analysis.mergeVerdict === 'READY' ? '✅ Ready to Merge' : analysis.mergeVerdict === 'NEEDS_CHANGES' ? '🚫 Needs Changes' : analysis.mergeVerdict === 'NEEDS_DISCUSSION' ? '💬 Needs Discussion' : '—'}
  </p>
</div>

<!-- Analysis Coverage -->
${analysis.analysisCoverage?.isPartial ? `
<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
  <p style="margin:0;font-size:13px;color:#92400e;">
    <strong>⚠️ Partial Analysis:</strong> This review covers ${analysis.analysisCoverage?.filesAnalyzed ?? 0} of ${analysis.analysisCoverage?.totalFilesChanged ?? 0} changed files.
    ${(analysis.analysisCoverage?.totalFilesChanged ?? 0) - (analysis.analysisCoverage?.filesAnalyzed ?? 0) > 0 ? `${(analysis.analysisCoverage?.totalFilesChanged ?? 0) - (analysis.analysisCoverage?.filesAnalyzed ?? 0)} file(s) were not reviewed.` : ''}
    Issues outside the reviewed files may not be caught.
  </p>
</div>` : `
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
  <p style="margin:0;font-size:13px;color:#166534;">
    <strong>✅ Full Analysis:</strong> All ${analysis.analysisCoverage?.totalFilesChanged ?? (pr.changedFiles ?? []).length} changed file(s) in this PR were reviewed.
  </p>
</div>`}

<!-- Security Findings -->
<div style="background:${(analysis.securityFindings ?? []).length > 0 ? '#fff5f5' : '#f9fafb'};border:${(analysis.securityFindings ?? []).length > 0 ? '2px solid #dc2626' : '1px solid #e5e7eb'};border-radius:8px;padding:20px;margin-bottom:20px;">
  <h2 style="margin:0 0 16px;font-size:16px;color:${(analysis.securityFindings ?? []).length > 0 ? '#dc2626' : '#374151'};">🔒 Security Findings (${(analysis.securityFindings ?? []).length})</h2>
  ${(analysis.securityFindings ?? []).length > 0 ? `
  <table style="width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed;">
    <thead>
      <tr style="background:#f3f4f6;">
        <th style="width:22%;padding:8px;border:1px solid #e5e7eb;text-align:left;">File</th>
        <th style="width:56%;padding:8px;border:1px solid #e5e7eb;text-align:left;">Issue</th>
        <th style="width:22%;padding:8px;border:1px solid #e5e7eb;text-align:left;">Severity</th>
      </tr>
    </thead>
    <tbody>
      ${(analysis.securityFindings ?? []).map((f) => `
      <tr>
        <td style="padding:8px;border:1px solid #e5e7eb;font-family:monospace;font-size:12px;word-break:break-all;vertical-align:top;">${f.file ?? '—'}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;word-break:break-word;vertical-align:top;">${f.issue ?? '—'}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;vertical-align:top;color:${f.severity === 'HIGH' ? '#dc2626' : f.severity === 'MEDIUM' ? '#d97706' : '#2563eb'};">${f.severity ?? '—'}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : `<p style="margin:0;font-size:13px;color:#16a34a;">No security issues found in the reviewed files.</p>`}
</div>

<!-- Breaking Changes -->
<div style="background:${(analysis.breakingChanges ?? []).length > 0 ? '#fff7ed' : '#f9fafb'};border:${(analysis.breakingChanges ?? []).length > 0 ? '2px solid #ea580c' : '1px solid #e5e7eb'};border-radius:8px;padding:20px;margin-bottom:20px;">
  <h2 style="margin:0 0 16px;font-size:16px;color:${(analysis.breakingChanges ?? []).length > 0 ? '#ea580c' : '#374151'};">💥 Breaking Changes (${(analysis.breakingChanges ?? []).length})</h2>
  ${(analysis.breakingChanges ?? []).length > 0 ? `
  <ul style="margin:0;padding-left:20px;">
    ${(analysis.breakingChanges ?? []).map((b) => `<li style="font-size:13px;color:#4b5563;margin-bottom:6px;">${b}</li>`).join('')}
  </ul>` : `<p style="margin:0;font-size:13px;color:#16a34a;">No breaking changes detected.</p>`}
</div>

<!-- Test Coverage -->
<div style="background:${analysis.testCoverageGap?.hasGap ? '#fffbeb' : '#f0fdf4'};border:1px solid ${analysis.testCoverageGap?.hasGap ? '#fde68a' : '#bbf7d0'};border-radius:8px;padding:20px;margin-bottom:20px;">
  <h2 style="margin:0 0 12px;font-size:16px;color:#374151;">🧪 Test Coverage</h2>
  <p style="margin:0;font-size:13px;color:${analysis.testCoverageGap?.hasGap ? '#92400e' : '#166534'};">
    ${analysis.testCoverageGap?.hasGap ? `⚠️ Gap detected — ${analysis.testCoverageGap?.note ?? 'details not available'}` : '✅ No test coverage gap identified for this change.'}
  </p>
</div>

<!-- Diff Scope -->
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:20px;">
    <h2 style="margin:0 0 16px;font-size:16px;color:#374151;">📂 Diff Scope</h2>

    <table style="width:100%;border-collapse:separate;border-spacing:8px 0;margin:0 0 16px -8px;">
      <tr>
        <td style="width:33%;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:10px;text-align:center;">
          <p style="margin:0;font-size:20px;font-weight:bold;color:#111827;">${(pr.changedFiles ?? []).length}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">Files Changed</p>
        </td>
        <td style="width:33%;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:10px;text-align:center;">
          <p style="margin:0;font-size:20px;font-weight:bold;color:#16a34a;">+${(pr.changedFiles ?? []).reduce((sum, f) => sum + (f.additions ?? 0), 0)}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">Insertions</p>
        </td>
        <td style="width:33%;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:10px;text-align:center;">
          <p style="margin:0;font-size:20px;font-weight:bold;color:#dc2626;">-${(pr.changedFiles ?? []).reduce((sum, f) => sum + (f.deletions ?? 0), 0)}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">Deletions</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Changed Files:</p>
    <div style="background:#1e1e1e;border-radius:6px;padding:12px;">
      ${(pr.changedFiles ?? []).length === 0 ? `<p style="color:#9ca3af;font-size:12px;margin:0;">No file data</p>` : `
      <table style="width:100%;border-collapse:collapse;">
        ${(pr.changedFiles ?? []).slice(0, 10).map((f) => `
          <tr>
            <td style="padding:3px 6px 3px 0;width:22px;vertical-align:middle;">
              <span style="display:inline-block;font-size:11px;font-weight:bold;padding:1px 6px;border-radius:3px;background:${f.status === 'added' ? '#16a34a' :
            f.status === 'deleted' ? '#dc2626' :
              f.status === 'renamed' ? '#d97706' : '#2563eb'
          };color:#ffffff;">${f.status?.toUpperCase()?.slice(0, 1) ?? 'M'}</span>
            </td>
            <td style="padding:3px 6px;font-family:monospace;font-size:12px;color:#e5e7eb;word-break:break-all;">${f.filename}</td>
            <td style="padding:3px 0;text-align:right;white-space:nowrap;font-size:11px;color:#6b7280;">+${f.additions ?? 0} -${f.deletions ?? 0}</td>
          </tr>`).join('')}
      </table>
      ${(pr.changedFiles ?? []).length > 10 ? `<p style="color:#9ca3af;font-size:11px;margin:8px 0 0;">+${(pr.changedFiles!.length - 10)} more files...</p>` : ''}
      `}
    </div>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:16px;color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;margin-top:24px;">
    <p style="margin:0;">Generated by AI PR Analyzer · ${new Date().toLocaleDateString()}</p>
   <p style="margin:4px 0 0;">Model: ${analysis.aiModel} · Tokens: ${analysis.tokensUsed?.toLocaleString() ?? '—'}</p>
  </div>

</body>
</html>`
  }

  async sendPRAnalysisReport(params: {
    toEmail: string
    toName: string
    pr: IPullRequest
    analysis: IAnalysis
  }): Promise<void> {
    const { toEmail, toName, pr, analysis } = params

    const htmlContent = this.buildHTMLDocument(pr, analysis)

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    const page = await browser.newPage()
    await page.setContent(htmlContent, {
      waitUntil: 'load',
    })
    await page.waitForNetworkIdle()
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px', },
      printBackground: true,
    })

    await browser.close()

    const fileName = `PR-${pr.prNumber}-${pr.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-analysis.pdf`

    const msg = {
      to: toEmail,
      from: { email: env.FROM_EMAIL, name: 'AI PR Analyzer' },
      subject: `PR #${pr.prNumber} Analysis Report — ${pr.title}`,
      html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <p>Hi ${toName},</p>
        <p>Your PR <strong>#${pr.prNumber}: ${pr.title}</strong> has been analyzed.</p>
        <p>Risk Level: <strong>${analysis.riskLevel}</strong> (${analysis.riskScore}/100)</p>
        <p>Please find the detailed PDF analysis report attached.</p>
        <p style="color:#6b7280;font-size:12px;">— AI PR Analyzer</p>
      </div>
    `,
      attachments: [
        {
          content: Buffer.from(pdfBuffer).toString('base64'),
          filename: fileName,
          type: 'application/pdf',
          disposition: 'attachment',
        },
      ],
    }

    await sgMail.send(msg)
    logger.info({ toEmail, prNumber: pr.prNumber }, 'PR analysis email sent')
  }



  // when skill file failed case 
  async sendSkillGenerationFailedEmail(params: {
    toEmail: string
    toName: string
    repoFullName: string
    reason: 'OLLAMA_DOWN' | 'GENERATION_FAILED'
    errorMessage?: string
  }): Promise<void> {
    const { toEmail, toName, repoFullName, reason, errorMessage } = params

    const isOllamaDown = reason === 'OLLAMA_DOWN'
    const subject = isOllamaDown
      ? `⚠️ AI service unavailable — skill file generation paused for ${repoFullName}`
      : `❌ Skill file generation failed — ${repoFullName}`

    const bodyText = isOllamaDown
      ? `Our AI analysis service (Ollama) is temporarily unavailable, so we were unable to generate the skill file for <strong>${repoFullName}</strong>.`
      : `An error occurred while generating the skill file for <strong>${repoFullName}</strong>.`

    const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:${isOllamaDown ? '#fffbeb' : '#fef2f2'};border:1px solid ${isOllamaDown ? '#fde68a' : '#fecaca'};border-radius:8px;padding:16px 20px;margin-bottom:16px;">
      <p style="margin:0;color:${isOllamaDown ? '#92400e' : '#991b1b'};font-weight:600;">
        ${isOllamaDown ? '⚠️ AI Service Unavailable' : '❌ Generation Failed'}
      </p>
    </div>
    <p>Hi ${toName},</p>
    <p>${bodyText}</p>
    ${errorMessage ? `<p style="background:#f3f4f6;padding:10px;border-radius:6px;font-family:monospace;font-size:12px;color:#4b5563;">${errorMessage}</p>` : ''}
    <p>${isOllamaDown ? 'We will retry automatically once the service is restored, or you can manually retry the operation.' : 'You can try generating the skill file again from your repository settings.'}</p>
    <p style="color:#6b7280;font-size:12px;">— AI PR Analyzer</p>
  </div>
`

    await sgMail.send({
      to: toEmail,
      from: { email: env.FROM_EMAIL, name: 'AI PR Analyzer' },
      subject,
      html,
    })

    logger.info({ toEmail, repoFullName, reason }, 'Skill generation failure email sent')
  }

}

export const emailService = new EmailService()