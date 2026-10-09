import { Job } from 'bullmq'
import { PRAnalysisJobData } from '../globals/types'
import { aiAnalyzerService, MAX_FILES } from '../services/ai-analyzer.service'
import { getProviderService } from '../services/providers/provider-factory'
import { billingService } from '../services/billing.service'
import { PullRequestModel } from '../models/PullRequest.model'
import { AnalysisModel } from '../models/Analysis.model'
import { UserModel } from '../models/User.model'
import { RepoSkillModel } from '../models/RepoSkill.model'
import { AnalysisStatus, BillingAction, SkillStatus, GitProvider } from '../globals/enums'
import { logger } from '../lib/logger'
import { getValidBitbucketAccessToken } from '@/services/providers/bitbucket-refresh-token/bitbucket-token.service'
import { getDecryptedTokenForProvider } from '@/utils/provider-token.util'
import { emailService } from '@/services/pr-send-mail/premail.service'
import { env } from '../config/env'

export const processPRAnalysis = async (job: Job<PRAnalysisJobData>): Promise<void> => {
  const { pullRequestId, repositoryId, userId, prNumber, githubRepoFullName } = job.data
  const provider = job.data.provider ?? GitProvider.GITHUB
  const startTime = Date.now()

  logger.info({ pullRequestId, prNumber, provider }, 'Starting PR analysis job')

  // 1. Mark as ANALYZING
  await PullRequestModel.findByIdAndUpdate(pullRequestId, {
    analysisStatus: AnalysisStatus.ANALYZING,
  })

  // 2. Get user's token (decrypted) —
  const user = await UserModel.findById(userId).select(
    'githubAccessToken bitbucketAccessToken gitlabAccessToken email name plan tokenUsage'
  )
  if (!user) throw new Error(`User not found: ${userId}`)

  const accessToken = provider === GitProvider.BITBUCKET ? await getValidBitbucketAccessToken(userId) : getDecryptedTokenForProvider(user, provider)
  const providerService = getProviderService(provider)

  // 3. Fetch PR data from provider (GitHub / Bitbucket)
  const [prData, rawChangedFiles] = await Promise.all([
    providerService.getPullRequest(accessToken, githubRepoFullName, prNumber),
    providerService.getPRFiles(accessToken, githubRepoFullName, prNumber),
  ])

  const sortedChangedFiles = [...rawChangedFiles].sort(
    (a, b) => (b.deletions - a.deletions) || (b.additions - a.additions)
  )

  const filesToDeepen = sortedChangedFiles.slice(0, MAX_FILES)
  const fullContents = await Promise.all(
    filesToDeepen.map((f) =>
      providerService.readFile(accessToken, githubRepoFullName, prData.head.ref, f.filename).catch(() => null)
    )
  )
  const changedFiles = sortedChangedFiles.map((f, i) =>
    i < MAX_FILES ? { ...f, fullContent: fullContents[i] } : f
  )

  logger.info(
    { repositoryId, prNumber, filesConsidered: rawChangedFiles.length, filesDeepened: filesToDeepen.length },
    'Changed files prioritized and full content fetched for PR analysis'
  )

  // 4. Repo ACTIVE skill file
  const repoSkill = await RepoSkillModel.findOne({
    repositoryId,
    isActive: true,
    status: SkillStatus.READY,
  })

  if (!repoSkill) {
    logger.info({ repositoryId }, 'No active skill file found — analyzing without project context')
  }

  // 5. Run AI analysis
  const { output, tokensUsed, promptTokens, completionTokens, aiModel, analysisCoverage } = await aiAnalyzerService.analyze({
    prTitle: prData.title,
    prDescription: prData.body || '',
    changedFiles,
    repoName: githubRepoFullName,
    skillContext: repoSkill
      ? {
        techStack: repoSkill.techStack,
        conventions: repoSkill.conventions,
        summary: repoSkill.summary,
        reviewFocusAreas: repoSkill.reviewFocusAreas,
      }
      : null,
  })

  const processingTimeMs = Date.now() - startTime

  // 6. Save analysis result
  await AnalysisModel.create({
    pullRequestId,
    userId,
    summary: output.summary,
    riskLevel: output.riskLevel,
    riskScore: output.riskScore,
    riskReasons: output.riskReasons,
    testingSuggestions: output.testingSuggestions,
    reviewComments: output.reviewComments,
    aiModel,
    tokensUsed,
    processingTimeMs,
    mergeVerdict: output.mergeVerdict,
    securityFindings: output.securityFindings,
    breakingChanges: output.breakingChanges,
    testCoverageGap: output.testCoverageGap,

    analysisCoverage: analysisCoverage,
  })

  // 7. Update PR status to DONE
  await PullRequestModel.findByIdAndUpdate(pullRequestId, {
    analysisStatus: AnalysisStatus.DONE,
    changedFiles,
  })

  // 8. Track billing
  await billingService.recordUsage({
    userId,
    action: BillingAction.PR_ANALYSIS,
    tokensUsed,
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    aiModel,
    llmProvider: env.LLM_FAMILY,
    prId: pullRequestId,
    repositoryId,
  })

  // 9. Send email report
  if (user.email) {
    try {
      await emailService.sendPRAnalysisReport({
        toEmail: user.email,
        toName: user.name,
        pr: {
          prNumber,
          title: prData.title,
          author: prData.user.login,
          baseBranch: prData.base.ref,
          headBranch: prData.head.ref,
          createdAt: new Date().toISOString(),
          changedFiles,
          repositoryFullName: githubRepoFullName,
          status: AnalysisStatus.DONE,
          plan: user.plan,
          tokenUsage: user.tokenUsage,
          provider,
        } as any,
        analysis: {
          summary: output.summary,
          riskLevel: output.riskLevel,
          riskScore: output.riskScore,
          riskReasons: output.riskReasons,
          testingSuggestions: output.testingSuggestions,
          reviewComments: output.reviewComments,
          aiModel,
          tokensUsed,
          processingTimeMs,
          mergeVerdict: output.mergeVerdict,
          securityFindings: output.securityFindings,
          breakingChanges: output.breakingChanges,
          testCoverageGap: output.testCoverageGap,
          analysisCoverage,
        } as any,
      })
    } catch (error: any) {
      logger.error(
        { emailError: error?.message, stack: error?.stack, userId },
        'Failed to send PR analysis email'
      )
    }
  }

  logger.info({ pullRequestId, tokensUsed, processingTimeMs }, 'PR analysis completed')
}