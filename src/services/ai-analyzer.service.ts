import { z } from 'zod'
import { openaiClient, defaultChatModel } from '../lib/ai-client'
import { IChangedFile } from '../globals/interfaces'
import { logger } from '../lib/logger'
import { AppError } from '../lib/errors'

// Zod schema — AI output validated before saving
const AnalysisOutputSchema = z.object({
  summary: z.string().nullable().transform((v) => v ?? ''),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  riskScore: z.number().min(0).max(100),
  riskReasons: z.array(z.string()).max(8),
  testingSuggestions: z
    .array(
      z.object({
        area: z.string(),
        suggestion: z.string(),
        priority: z.preprocess((val) => {
          const v = String(val).toUpperCase()
          if (v === 'LOW' || v === 'MEDIUM' || v === 'HIGH') return v
          if (v === 'CRITICAL') return 'HIGH'
          return 'MEDIUM'
        }, z.enum(['LOW', 'MEDIUM', 'HIGH'])),
      })
    )
    .max(15),
  reviewComments: z
    .array(
      z.object({
        file: z.string(),
        line: z.number().optional(),
        comment: z.string(),
        severity: z.preprocess((val) => {
          const v = String(val).toUpperCase()
          if (v === 'INFO' || v === 'WARNING' || v === 'ERROR') return v
          if (v === 'CRITICAL' || v === 'HIGH' || v === 'BLOCKER') return 'ERROR'
          if (v === 'LOW' || v === 'MINOR') return 'INFO'
          return 'WARNING'
        }, z.enum(['INFO', 'WARNING', 'ERROR'])),
      })
    )
    .max(30),

  mergeVerdict: z.enum(['READY', 'NEEDS_CHANGES', 'NEEDS_DISCUSSION']),
  securityFindings: z.array(
    z.object({
      file: z.string(),
      issue: z.string(),
      severity: z.preprocess((val) => {
        const v = String(val).toUpperCase()
        if (v === 'HIGH' || v === 'MEDIUM' || v === 'LOW') return v
        if (v === 'CRITICAL') return 'HIGH'
        return 'MEDIUM'
      }, z.enum(['HIGH', 'MEDIUM', 'LOW'])),
    })
  ).max(15),
  breakingChanges: z.array(z.string()).max(15),

  testCoverageGap: z.object({
    hasGap: z.boolean(),
    note: z.string().nullable().transform((v) => v ?? ''),
  })
})

export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>

interface AnalyzeParams {
  prTitle: string
  prDescription: string
  changedFiles: IChangedFile[]
  repoName: string
  skillContext?: {
    techStack: string[]
    conventions: string[]
    summary: string
    reviewFocusAreas: string[]
  } | null
}

interface AnalyzeResult {
  promptTokens: number
  completionTokens: number
  output: AnalysisOutput
  tokensUsed: number
  aiModel: string
  analysisCoverage: {
    isPartial: boolean
    totalFilesChanged: number
    filesAnalyzed: number
    filesTruncated: number
  }
}

export const MAX_FILES = 10

export class AIAnalyzerService {

  private buildPrompt(params: AnalyzeParams): { prompt: string; coverage: AnalyzeResult['analysisCoverage'] } {

    const filesTruncatedCount = 0

    const filesSummary = params.changedFiles
      .slice(0, MAX_FILES)
      .map((f) => {
        const patch = f.patch || ''
        const fullContentBlock = f.fullContent
          ? `\nFull current file content (use this to check whether anything removed above is still referenced elsewhere in this file, beyond what the diff shows):\n${f.fullContent.slice(0, 8000)}${f.fullContent.length > 8000 ? '\n... [file truncated]' : ''}\n`
          : ''
        return `File: ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})\n${patch ? `Diff:\n${patch}` : ''}${fullContentBlock}`
      })
      .join('\n\n')

    const totalFilesChanged = params.changedFiles.length
    const filesAnalyzed = Math.min(totalFilesChanged, MAX_FILES)
    const filesNotShown = totalFilesChanged > MAX_FILES ? totalFilesChanged - MAX_FILES : 0
    const isPartial = totalFilesChanged > MAX_FILES

    const truncationNote = isPartial
      ? `\nIMPORTANT CONTEXT: This analysis only covers the first ${MAX_FILES} of ${totalFilesChanged} changed files (each shown in full) — ${filesNotShown} additional changed file(s) are not shown at all. In your summary and mergeVerdict, explicitly acknowledge that the review does not cover the whole PR and may not catch issues in the files not shown. Do not claim full confidence in areas not visible to you.\n`
      : ''

    const skillBlock = params.skillContext
      ? `Project Context (use this to judge if the PR follows this project's own established conventions):
- Tech stack: ${params.skillContext.techStack.join(', ') || 'unknown'}
- Established conventions: ${params.skillContext.conventions.join('; ') || 'none recorded'}
- Project summary: ${params.skillContext.summary || 'none'}
- Extra areas to focus review on for this repo: ${params.skillContext.reviewFocusAreas.join('; ') || 'none'}
When the diff touches one of the "areas to focus review on" above, review it more strictly and explain why it matters for this specific project. 
When code deviates from an established convention listed above, flag it explicitly as a reviewComment referencing that convention.
`
      : ''

    const prompt = `You are an expert code reviewer. Analyze this Pull Request and respond ONLY with valid JSON matching the exact structure below. No markdown, no explanation outside the JSON.
${truncationNote}
${skillBlock}PR Title: ${params.prTitle}
PR Description: ${params.prDescription || 'No description provided'}
Repository: ${params.repoName}
Total files changed in this PR: ${totalFilesChanged}

Changed Files${filesNotShown > 0 ? ` (showing first ${MAX_FILES} of ${totalFilesChanged})` : ''}:
${filesSummary}

Instructions:
## RULES
- Ground every finding in the diff actually shown above — never invent a file, line number, or issue you cannot see.
- CRITICAL CHECK: When a file's full content is provided below its diff, use it. If the diff removes or comments out a declaration (a variable, hook, import, or function), check the full file content to see if it is still referenced elsewhere — if so, this is a definite bug (e.g. "ReferenceError" / broken build) and must be flagged as an ERROR review comment and factored into riskScore and mergeVerdict. Do not rely on the diff alone for this check, since usages outside the diff's visible lines will not otherwise be seen.
- summary: 5-6 clear, professional sentences covering what changed, why (based on PR description/commits), impact on the system, and scope of files touched. If the diff was truncated or files were omitted, mention this transparently in one sentence.
- mergeVerdict: READY if no blockers and low risk. NEEDS_CHANGES if blockers or high-severity issues exist. NEEDS_DISCUSSION if scope is ambiguous, architectural concerns exist, or the diff is too large to fully assess.
- securityFindings: Scan for hardcoded secrets, SQL injection risk, XSS risk, missing auth checks on new routes. Only report findings clearly visible in the shown diff. Empty array if none found.
- breakingChanges: List changes to exported function signatures, public API contracts, or DB schema, based only on what's visible in the diff. Empty array if none.
- testCoverageGap: Set hasGap=true if significant logic changed without corresponding test file changes visible in the diff. Write a short, clear note explaining what's untested.
- reviewComments: Keep comments specific, actionable, and professional — reference exact file names from the diff above and describe the issue clearly in plain language a developer can act on immediately. Prefer several precise comments over one vague one.
- riskReasons: Each reason must tie back to something actually observed in the diff — not generic risk language.

Respond with exactly this JSON structure:
{
  "summary": "string",
  "riskLevel": "LOW|MEDIUM|HIGH|CRITICAL",
  "riskScore": 0-100,
  "riskReasons": ["reason1", "reason2"],
  "testingSuggestions": [
    { "area": "<test category relevant to this PR>", "suggestion": "<specific test to add>", "priority": "HIGH" }
  ],
  "reviewComments": [
    { "file": "<exact filename from the diff above>", "line": 42, "comment": "<specific, actionable comment>", "severity": "WARNING" }
  ],
  "mergeVerdict": "READY|NEEDS_CHANGES|NEEDS_DISCUSSION",
  "securityFindings": [
    { "file": "<exact filename from the diff above>", "issue": "<specific security issue found>", "severity": "HIGH" }
  ],
  "breakingChanges": ["<specific breaking change description>"],
  "testCoverageGap": { "hasGap": true, "note": "<specific note about what's untested>" }
}`

    return {
      prompt,
      coverage: {
        isPartial,
        totalFilesChanged,
        filesAnalyzed,
        filesTruncated: filesTruncatedCount,
      },
    }
  }

  async analyze(params: AnalyzeParams): Promise<AnalyzeResult> {
    const { prompt, coverage } = this.buildPrompt(params)

    const response = await openaiClient.chat.completions.create({
      model: defaultChatModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 6000,
    })

    const rawContent = response.choices[0]?.message?.content
    if (!rawContent) {
      throw new AppError('AI returned empty response', 500, 'AI_ERROR')
    }

    // Clean and parse JSON
    const cleaned = rawContent.replace(/```json|```/g, '').trim()
    let parsed: unknown
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      throw new AppError('AI returned invalid JSON', 500, 'AI_PARSE_ERROR')
    }

    // Validate with Zod
    const validated = AnalysisOutputSchema.safeParse(parsed)
    if (!validated.success) {
      logger.error({ errors: validated.error.flatten() }, 'AI output failed Zod validation')
      throw new AppError('AI output validation failed', 500, 'AI_VALIDATION_ERROR')
    }

    return {
      output: validated.data,
      tokensUsed: response.usage?.total_tokens ?? 0,
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      aiModel: defaultChatModel,
      analysisCoverage: coverage,
    }

  }


}

export const aiAnalyzerService = new AIAnalyzerService()