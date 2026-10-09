import { Job } from 'bullmq'
import { processSkillGeneration } from './skill-generation.worker'
import { SkillGenerationJobData } from '../globals/types'
import { SkillStatus } from '../globals/enums'
import { RepoSkillModel } from '../models/RepoSkill.model'
import { retryWithBackoff } from '../utils/retry.util'
import { logger } from '../lib/logger'
import { UserModel } from '../models/User.model'
import { emailService } from '@/services/pr-send-mail/premail.service'

export const skillGenerationQueue = {
  add: async (_name: string, data: SkillGenerationJobData): Promise<void> => {
    const draft = await RepoSkillModel.create({
      repositoryId: data.repositoryId,
      userId: data.userId,
      status: SkillStatus.GENERATING,
      source: 'ai_generated',
      isActive: false,
    })

    const jobData: SkillGenerationJobData = { ...data, skillId: draft._id.toString() }
    const fakeJob = { data: jobData } as Job<SkillGenerationJobData>

    retryWithBackoff(() => processSkillGeneration(fakeJob), {
      attempts: 3,
      initialDelayMs: 5000,
      label: `Skill generation (repo ${data.repositoryId})`,
    }).catch(async (error) => {
      await RepoSkillModel.findByIdAndUpdate(draft._id, {
        status: SkillStatus.FAILED,
        errorMessage: error?.message ?? 'Unknown error',
      })
      logger.error({ error: error?.message, repositoryId: data.repositoryId }, 'Skill generation job failed after all retries')

      const user = await UserModel.findById(data.userId).select('email name')
      if (user?.email) {
        try {
          await emailService.sendSkillGenerationFailedEmail({
            toEmail: user.email,
            toName: user.name || 'there',
            repoFullName: data.githubRepoFullName,
            reason: error?.isOllamaDown
              ? 'OLLAMA_DOWN'
              : 'GENERATION_FAILED',
            errorMessage: error?.isOllamaDown
              ? undefined
              : error?.message,
          })
        } catch (mailErr: any) {
          logger.error(
            { mailErr: mailErr?.message },
            'Failed to send final skill-generation-failed email'
          )
        }
      }


    })
  },
}