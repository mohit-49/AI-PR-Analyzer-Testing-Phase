import { Job } from 'bullmq'
import { processSkillAgentGeneration } from './skill-agent-generation.worker'
import { SkillGenerationJobData } from '../globals/types'
import { SkillStatus } from '../globals/enums'
import { RepoSkillModel } from '../models/RepoSkill.model'
import { retryWithBackoff } from '../utils/retry.util'
import { getAgentLogger } from '../agents/core/logger'

const log = getAgentLogger('skill-generation-agent')

export const skillAgentGenerationQueue = {
  add: async (_name: string, data: SkillGenerationJobData): Promise<void> => {
    const fakeJob = { data } as Job<SkillGenerationJobData>

    retryWithBackoff(() => processSkillAgentGeneration(fakeJob), {
      attempts: 2,
      initialDelayMs: 5000,
      label: `Agent skill generation (repo ${data.repositoryId})`,
    }).catch(async (error) => {
      if (data.skillId) {
        await RepoSkillModel.findByIdAndUpdate(data.skillId, {
          status: SkillStatus.FAILED,
          errorMessage: error?.message ?? 'Unknown error during agent generation',
        })
      }
      log.error({ error: error?.message, repositoryId: data.repositoryId }, 'Agent skill generation job failed after all retries')
    })
  },
}