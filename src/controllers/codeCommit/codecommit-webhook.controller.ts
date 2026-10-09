import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { RepositoryModel } from '@/models/Repository.model'
import { PullRequestModel } from '@/models/PullRequest.model'
import { prAnalysisQueue } from '@/queues/pr-analysis.queue'
import { GitProvider, AnalysisStatus } from '@/globals/enums'
import { ValidationError } from '@/lib/errors'
import { logger } from '@/lib/logger'

const CodeCommitWebhookSchema = z.object({
  repositoryName: z.string().min(1).max(200),
  pullRequestId: z.string().regex(/^\d+$/, 'pullRequestId must be numeric'),
  eventType: z.enum(['pullRequestCreated', 'pullRequestSourceBranchUpdated']),
})

export class CodeCommitWebhookController {
  async handlePullRequestEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = CodeCommitWebhookSchema.safeParse(req.body)
      if (!parsed.success) {
        throw new ValidationError('Invalid CodeCommit webhook payload')
      }
      const { repositoryName, pullRequestId, eventType } = parsed.data

      logger.info({ repositoryName, pullRequestId, eventType }, 'CodeCommit webhook received')

      const repository = await RepositoryModel.findOne({
        provider: GitProvider.CODECOMMIT,
        fullName: repositoryName,
      })

      if (!repository) {
        logger.warn({ repositoryName }, 'CodeCommit webhook — no matching connected repository')
        res.status(200).json({ success: true, message: 'Repository not connected — ignored' })
        return
      }

      const pr = await PullRequestModel.findOneAndUpdate(
        { repositoryId: repository._id, prNumber: Number(pullRequestId) },
        {
          repositoryId: repository._id,
          prNumber: Number(pullRequestId),
          analysisStatus: AnalysisStatus.PENDING,
        },
        { upsert: true, new: true }
      )

      await prAnalysisQueue.add('analyze-pr', {
        pullRequestId: pr._id.toString(),
        repositoryId: repository._id.toString(),
        userId: repository.userId.toString(),
        prNumber: Number(pullRequestId),
        githubRepoFullName: repositoryName,
        provider: GitProvider.CODECOMMIT,
      })

      res.status(200).json({ success: true, message: 'Analysis queued' })
    } catch (error) {
      next(error)
    }
  }
}

export const codecommitWebhookController = new CodeCommitWebhookController()