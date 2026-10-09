import { Job } from 'bullmq'
import { SkillGenerationJobData } from '../globals/types'
import { SkillStatus, GitProvider, BillingAction } from '../globals/enums'
import { getProviderService } from '../services/providers/provider-factory'
import { skillAnalyzerService } from '../services/skill-analyzer.service'
import { activateSkillVersion } from '../services/skill-version.service'
import { RepoSkillModel } from '../models/RepoSkill.model'
import { UserModel } from '../models/User.model'
import { getDecryptedTokenForProvider } from '../utils/provider-token.util'
import { logger } from '../lib/logger'
import { getValidBitbucketAccessToken } from '@/services/providers/bitbucket-refresh-token/bitbucket-token.service'
import { billingService } from '../services/billing.service'
import { env } from '../config/env'
// import { emailService } from '@/services/pr-send-mail/premail.service'

export const processSkillGeneration = async (job: Job<SkillGenerationJobData>): Promise<void> => {
  const { repositoryId, userId, githubRepoFullName, defaultBranch, skillId } = job.data
  const provider = job.data.provider ?? GitProvider.GITHUB

  logger.info({ repositoryId, githubRepoFullName, provider, skillId }, 'Starting skill file generation job')

  if (!skillId) {
    throw new Error('processSkillGeneration requires job.data.skillId (draft must be created before enqueueing)')
  }

  const draft = await RepoSkillModel.findById(skillId)
  if (!draft) {
    throw new Error(`Draft skill record not found: ${skillId}`)
  }

  const user = await UserModel.findById(userId).select('githubAccessToken bitbucketAccessToken gitlabAccessToken')
  if (!user) throw new Error(`User not found: ${userId}`)
  const accessToken = provider === GitProvider.BITBUCKET ? await getValidBitbucketAccessToken(userId) : getDecryptedTokenForProvider(user, provider)
  const providerService = getProviderService(provider)

  const context = await providerService.getRepoContext(accessToken, githubRepoFullName, defaultBranch)

  const { output, tokensUsed, promptTokens, completionTokens, aiModel, rawModelOutput } = await skillAnalyzerService.generate({
    repoFullName: githubRepoFullName,
    fileTree: context.fileTree,
    packageJson: context.packageJson,
    readme: context.readme,
  })

  await RepoSkillModel.findByIdAndUpdate(draft._id, {
    status: SkillStatus.READY,
    techStack: output.techStack,
    conventions: output.conventions,
    summary: output.summary,
    reviewFocusAreas: output.reviewFocusAreas,
    rawModelOutput,
    aiModel,
    tokensUsed,
    generatedAt: new Date(),
    errorMessage: undefined,
  })

  await billingService.recordUsage({
    userId,
    action: BillingAction.SKILL_GENERATION,
    tokensUsed,
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    aiModel,
    llmProvider: env.LLM_FAMILY,
    repositoryId,
  })

  await activateSkillVersion(repositoryId, draft._id)

  logger.info({ repositoryId, tokensUsed }, 'Skill file generated successfully')
}






// export const processSkillGeneration = async (job: Job<SkillGenerationJobData>): Promise<void> => {
  
//   const { repositoryId, userId, githubRepoFullName, defaultBranch, skillId } = job.data
//   const provider = job.data.provider ?? GitProvider.GITHUB

//   logger.info({ repositoryId, githubRepoFullName, provider, skillId }, 'Starting skill file generation job')

//   if (!skillId) {
//     throw new Error('processSkillGeneration requires job.data.skillId (draft must be created before enqueueing)')
//   }

//   const draft = await RepoSkillModel.findById(skillId)
//   if (!draft) {
//     throw new Error(`Draft skill record not found: ${skillId}`)
//   }

//   const user = await UserModel.findById(userId).select('githubAccessToken bitbucketAccessToken gitlabAccessToken email name')
//   if (!user) throw new Error(`User not found: ${userId}`)

//   try {
//     const accessToken = provider === GitProvider.BITBUCKET ? await getValidBitbucketAccessToken(userId) : getDecryptedTokenForProvider(user, provider)
//     const providerService = getProviderService(provider)

//     const context = await providerService.getRepoContext(accessToken, githubRepoFullName, defaultBranch)

//     const { output, tokensUsed, promptTokens, completionTokens, aiModel, rawModelOutput } = await skillAnalyzerService.generate({
//       repoFullName: githubRepoFullName,
//       fileTree: context.fileTree,
//       packageJson: context.packageJson,
//       readme: context.readme,
//     })

//     await RepoSkillModel.findByIdAndUpdate(draft._id, {
//       status: SkillStatus.READY,
//       techStack: output.techStack,
//       conventions: output.conventions,
//       summary: output.summary,
//       reviewFocusAreas: output.reviewFocusAreas,
//       rawModelOutput,
//       aiModel,
//       tokensUsed,
//       generatedAt: new Date(),
//       errorMessage: undefined,
//     })

//     await billingService.recordUsage({
//       userId,
//       action: BillingAction.SKILL_GENERATION,
//       tokensUsed,
//       inputTokens: promptTokens,
//       outputTokens: completionTokens,
//       aiModel,
//       llmProvider: env.LLM_FAMILY,
//       repositoryId,
//     })

//     await activateSkillVersion(repositoryId, draft._id)

//     logger.info({ repositoryId, tokensUsed }, 'Skill file generated successfully')
//   } catch (error: any) {
//     const isOllamaDown = error?.isOllamaDown === true

//     await RepoSkillModel.findByIdAndUpdate(draft._id, {
//       status: SkillStatus.FAILED,
//       errorMessage: error?.message || 'Unknown error during skill generation',
//     })

//     logger.error({ repositoryId, skillId, error: error?.message }, 'Skill file generation failed')

//     if (user.email) {
//       try {
//         await emailService.sendSkillGenerationFailedEmail({
//           toEmail: user.email,
//           toName: user.name || 'there',
//           repoFullName: githubRepoFullName,
//           reason: isOllamaDown ? 'OLLAMA_DOWN' : 'GENERATION_FAILED',
//           errorMessage: isOllamaDown ? undefined : error?.message,
//         })
//       } catch (mailErr: any) {
//         logger.error({ mailErr: mailErr?.message }, 'Failed to send skill-generation-failed email')
//       }
//     }

//     throw error // BullMQ ko retry/failed marking ke liye rethrow zaroori hai
//   }
// }