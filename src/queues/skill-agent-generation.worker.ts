import { Job } from 'bullmq'
import { SkillGenerationJobData } from '../globals/types'
import { SkillStatus, GitProvider } from '../globals/enums'
import { getProviderService } from '../services/providers/provider-factory'
import { activateSkillVersion } from '../services/skill-version.service'
import { RepoSkillModel } from '../models/RepoSkill.model'
import { UserModel } from '../models/User.model'
import { getDecryptedTokenForProvider } from '../utils/provider-token.util'
import { getValidBitbucketAccessToken } from '@/services/providers/bitbucket-refresh-token/bitbucket-token.service'
import { runSkillGenerationAgent } from '../agents/skill-generation-agent/entrypoint'
import { getAgentLogger } from '../agents/core/logger'
import { billingService } from '../services/billing.service'
import { BillingAction } from '../globals/enums'
import { env } from '../config/env'

const log = getAgentLogger('skill-generation-agent')

export const processSkillAgentGeneration = async (job: Job<SkillGenerationJobData>): Promise<void> => {
  const { repositoryId, userId, githubRepoFullName, defaultBranch } = job.data
  const provider = job.data.provider ?? GitProvider.GITHUB

  log.info({ repositoryId, githubRepoFullName, provider }, 'Agent-based skill generation job started')

  const draft = job.data.skillId
    ? await RepoSkillModel.findById(job.data.skillId)
    : await RepoSkillModel.create({
      repositoryId,
      userId,
      status: SkillStatus.GENERATING,
      source: 'ai_generated',
      generationMethod: 'agent',
      isActive: false,
    })

  if (!draft) {
    log.error({ repositoryId, skillId: job.data.skillId }, 'Draft skill record not found for agent generation')
    throw new Error(`Draft skill record not found: ${job.data.skillId}`)
  }

  log.info({ repositoryId, skillId: draft._id.toString() }, 'Draft skill record ready — status GENERATING')

  await RepoSkillModel.findByIdAndUpdate(draft._id, { agentSteps: [] })



  try {
    const user = await UserModel.findById(userId).select('githubAccessToken bitbucketAccessToken gitlabAccessToken')
    if (!user) {
      log.error({ repositoryId, userId }, 'User not found while starting agent generation')
      throw new Error(`User not found: ${userId}`)
    }

    const accessToken =
      provider === GitProvider.BITBUCKET
        ? await getValidBitbucketAccessToken(userId)
        : getDecryptedTokenForProvider(user, provider)

    const providerService = getProviderService(provider)

    const result = await runSkillGenerationAgent({
      repoContext: {
        provider,
        providerService,
        accessToken,
        repoFullName: githubRepoFullName,
        branch: defaultBranch,
      },

      onProgress: async (step: string) => {
        try {
          await RepoSkillModel.findByIdAndUpdate(draft._id, { $push: { agentSteps: step } })
        } catch (progressError) {
          log.warn({ repositoryId, step, error: (progressError as Error)?.message }, 'Failed to record agent progress step')
        }
      },
    })

    await RepoSkillModel.findByIdAndUpdate(draft._id, {
      status: SkillStatus.READY,
      techStack: result.output.techStack,
      conventions: result.output.conventions,
      summary: result.output.summary,
      reviewFocusAreas: result.output.reviewFocusAreas,
      aiModel: result.aiModel,
      tokensUsed: result.tokensUsed,
      generatedAt: new Date(),
      errorMessage: undefined,
    })

    await billingService.recordUsage({
      userId,
      action: BillingAction.SKILL_GENERATION,
      tokensUsed: result.tokensUsed,
      repositoryId,
      inputTokens: result.promptTokens,
      outputTokens: result.completionTokens,
      aiModel: result.aiModel,
      llmProvider: env.LLM_FAMILY,
    })


    await activateSkillVersion(repositoryId, draft._id)

    log.info(
      { repositoryId, skillId: draft._id.toString(), tokensUsed: result.tokensUsed, stepsTaken: result.stepsTaken },
      'Agent-based skill generation completed and activated'
    )
  } catch (error: any) {
    log.error(
      { repositoryId, skillId: draft._id.toString(), error: error?.message, stack: error?.stack },
      'Agent-based skill generation attempt failed — may retry'
    )
    throw error
  }

}
