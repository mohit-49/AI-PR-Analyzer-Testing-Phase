import { z } from 'zod'
import { openaiClient, defaultChatModel } from '../lib/ai-client'
import { logger } from '../lib/logger'
import { AppError } from '../lib/errors'

export const SkillOutputSchema = z.object({
  techStack: z.array(z.string()),
  conventions: z.array(z.string()),
  summary: z.string(),
  reviewFocusAreas: z.array(z.string()),
})

export type SkillOutput = z.infer<typeof SkillOutputSchema>

interface GenerateSkillParams {
  repoFullName: string
  fileTree: string[]
  packageJson: string | null
  readme: string | null
}

interface GenerateFromMarkdownParams {
  repoFullName: string
  markdown: string
}

interface GenerateSkillResult {
  output: SkillOutput
  tokensUsed: number
  promptTokens: number
  completionTokens: number
  aiModel: string
  rawModelOutput: string
}

export class SkillAnalyzerService {

  private buildPrompt(params: GenerateSkillParams): string {
    const treeSummary = params.fileTree.slice(0, 400).join('\n')

    return `You are a senior software architect analyzing the repository "${params.repoFullName}" to build a Skill File for another AI code reviewer — describing this repo's stack, conventions, and PR review priorities.

You are given a snapshot of the repo below (file tree, package.json, README). This is ALL the context you have — there is no further exploration possible, so extract everything useful from what's provided.

File tree:
${treeSummary || 'Not available'}

package.json:
${params.packageJson ? params.packageJson.slice(0, 4000) : 'Not found'}

README:
${params.readme ? params.readme.slice(0, 3000) : 'Not found'}

## RULES
- techStack: list EVERY meaningful dependency from package.json's "dependencies" and "devDependencies" (languages, frameworks, DB/ORM, auth, state management, UI/styling, validation, testing, build tools, real-time/queue libs, infra) — not just the 2-3 most obvious ones. Don't omit smaller but relevant packages.
- conventions: infer only from what the file tree and README actually show (folder/naming patterns visible in paths, structure described in the README, config files present) — do not invent conventions you have no evidence for.
- reviewFocusAreas: specific, repo-evidenced risks (e.g. a folder that suggests auth/payments/webhooks) — not generic review advice.
- summary: describe what the project is, its stack, and how it's structured, based only on the evidence above.
- Never invent technologies, conventions, or risks not supported by the file tree, package.json, or README.

Respond ONLY with this JSON structure (no markdown, no explanation):
{
  "techStack": ["e.g. Next.js", "TypeScript", "Express", "MongoDB"],
  "conventions": ["short bullet points describing coding conventions/patterns you can infer, e.g. 'API inputs validated with Zod', 'Feature-based folder structure', 'JWT-based auth middleware'"],
  "summary": "4-6 sentence summary of what this project is and how it's structured",
  "reviewFocusAreas": ["specific things a PR reviewer for THIS repo should pay extra attention to, e.g. 'Changes to auth/webhook signature verification', 'Changes to billing/token usage logic'"]
}`
  }

  private buildMarkdownPrompt(params: GenerateFromMarkdownParams): string {
    return `You are a senior software architect. A developer has uploaded a markdown file describing their project's conventions and architecture. Extract and structure this information — respond ONLY with valid JSON.

Repository: ${params.repoFullName}

Uploaded markdown content:
${params.markdown.slice(0, 10000)}

## RULES
- Extract every meaningful technology mentioned or clearly implied in the document — don't limit yourself to the most prominent ones.
- conventions and reviewFocusAreas must be grounded in what the document actually says — never invent details not present in it.

Respond ONLY with this JSON structure (no markdown, no explanation):
{
  "techStack": ["technologies mentioned or implied in the document"],
  "conventions": ["coding conventions/patterns described in the document"],
  "summary": "4-6 sentence summary of what this project is and how it's structured, based on the document",
  "reviewFocusAreas": ["specific things a PR reviewer for THIS repo should pay extra attention to, based on the document"]
}`
  }

  // private async runPrompt(prompt: string): Promise<GenerateSkillResult> {
  //   const response = await openaiClient.chat.completions.create({
  //     model: defaultChatModel,
  //     messages: [{ role: 'user', content: prompt }],
  //     temperature: 0.2,
  //     max_tokens: 3000,
  //   })

  //   const rawContent = response.choices[0]?.message?.content
  //   if (!rawContent) {
  //     throw new AppError('AI returned empty response for skill generation', 500, 'AI_ERROR')
  //   }

  //   const cleaned = rawContent.replace(/```json|```/g, '').trim()
  //   let parsed: unknown
  //   try {
  //     parsed = JSON.parse(cleaned)
  //   } catch {
  //     throw new AppError('AI returned invalid JSON for skill generation', 500, 'AI_PARSE_ERROR')
  //   }

  //   const validated = SkillOutputSchema.safeParse(parsed)
  //   if (!validated.success) {
  //     logger.error({ errors: validated.error.flatten() }, 'Skill AI output failed Zod validation')
  //     throw new AppError('Skill AI output validation failed', 500, 'AI_VALIDATION_ERROR')
  //   }

  //   return {
  //     output: validated.data,
  //     tokensUsed: response.usage?.total_tokens ?? 0,
  //     promptTokens: response.usage?.prompt_tokens ?? 0,
  //     completionTokens: response.usage?.completion_tokens ?? 0,
  //     aiModel: defaultChatModel,
  //     rawModelOutput: rawContent,
  //   }
  // }

    private async runPrompt(prompt: string): Promise<GenerateSkillResult> {
    let response: Awaited<ReturnType<typeof openaiClient.chat.completions.create>>

    try {
      response = await openaiClient.chat.completions.create({
        model: defaultChatModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 3000,
      })
    } catch (err: any) {
      const isConnectionError =
        err?.code === 'ECONNREFUSED' ||
        err?.cause?.code === 'ECONNREFUSED' ||
        err?.message?.includes('fetch failed') ||
        err?.message?.includes('ECONNREFUSED') ||
        err?.status === undefined // OpenAI SDK network errors often have no `status`, unlike API errors (400/500 etc.)

      logger.error({ err: err?.message, code: err?.code }, 'Failed to reach Ollama for skill generation')

      const wrapped = new AppError(
        isConnectionError ? 'AI service (Ollama) is unreachable' : 'AI request failed during skill generation',
        503,
        'AI_UNREACHABLE'
      ) as AppError & { isOllamaDown?: boolean }
      wrapped.isOllamaDown = isConnectionError

      throw wrapped
    }

    const rawContent = response.choices[0]?.message?.content
    if (!rawContent) {
      throw new AppError('AI returned empty response for skill generation', 500, 'AI_ERROR')
    }

    const cleaned = rawContent.replace(/```json|```/g, '').trim()
    let parsed: unknown
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      throw new AppError('AI returned invalid JSON for skill generation', 500, 'AI_PARSE_ERROR')
    }

    const validated = SkillOutputSchema.safeParse(parsed)
    if (!validated.success) {
      logger.error({ errors: validated.error.flatten() }, 'Skill AI output failed Zod validation')
      throw new AppError('Skill AI output validation failed', 500, 'AI_VALIDATION_ERROR')
    }

    return {
      output: validated.data,
      tokensUsed: response.usage?.total_tokens ?? 0,
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      aiModel: defaultChatModel,
      rawModelOutput: rawContent,
    }
  }

  async generate(params: GenerateSkillParams): Promise<GenerateSkillResult> {
    return this.runPrompt(this.buildPrompt(params))
  }

  async generateFromMarkdown(params: GenerateFromMarkdownParams): Promise<GenerateSkillResult> {
    return this.runPrompt(this.buildMarkdownPrompt(params))
  }
}

export const skillAnalyzerService = new SkillAnalyzerService()