import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { RepositoryModel } from '../models/Repository.model'
import { PullRequestModel } from '../models/PullRequest.model'
import { prAnalysisQueue } from '../queues/pr-analysis.queue'
import { PRStatus, AnalysisStatus } from '../globals/enums'
import { logger } from '../lib/logger'

export class WebhookController {

  async handleGitHub(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const event = req.headers['x-github-event'] as string
      const signature = req.headers['x-hub-signature-256'] as string | undefined
      const payload = req.body

      if (event !== 'pull_request') {
        res.json({ success: true, data: { message: 'Event ignored' } })
        return
      }

      const action = payload.action as string
      const prData = payload.pull_request

      const repository = await RepositoryModel.findOne({
        repoId: String(payload.repository.id),
        isActive: true,
      }).sort({ createdAt: -1 })

      if (!repository) {
        res.json({ success: true, data: { message: 'Repository not tracked' } })
        return
      }

      if (repository.webhookSecret) {
        if (!signature) {
          logger.warn({ repoId: repository._id }, 'Webhook missing signature — rejected')
          res.status(401).json({ success: false, error: { code: 'WEBHOOK_UNAUTHORIZED' } })
          return
        }

        const rawBody = (req as any).rawBody as Buffer | undefined
        if (!rawBody) {
          logger.error({ repoId: repository._id }, 'rawBody missing — check express.json verify middleware order')
          res.status(400).json({ success: false, error: { code: 'RAW_BODY_MISSING' } })
          return
        }

        const expected = `sha256=${crypto
          .createHmac('sha256', repository.webhookSecret)
          .update(rawBody)
          .digest('hex')}`

        const isValid =
          signature.length === expected.length &&
          crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))

        if (!isValid) {
          logger.warn({ repoId: repository._id }, 'Invalid webhook signature')
          res.status(401).json({ success: false, error: { code: 'WEBHOOK_UNAUTHORIZED' } })
          return
        }
      }

      logger.info({ action, prNumber: prData.number, repoId: repository._id }, 'Webhook received')

      if (action === 'opened' || action === 'synchronize') {
        const pr = await PullRequestModel.findOneAndUpdate(
          { githubPrId: prData.id, repositoryId: repository._id },
          {
            $set: {
              repositoryId: repository._id,
              userId: repository.userId,
              prNumber: prData.number,
              title: prData.title,
              description: prData.body || '',
              author: prData.user.login,
              baseBranch: prData.base.ref,
              headBranch: prData.head.ref,
              status: PRStatus.OPEN,
              analysisStatus: AnalysisStatus.QUEUED,
              githubPrId: prData.id,
              githubUrl: prData.html_url,
            },
          },
          { upsert: true, new: true }
        )

        await prAnalysisQueue.add('analyze-pr', {
          pullRequestId: pr._id.toString(),
          repositoryId: repository._id.toString(),
          userId: repository.userId.toString(),
          prNumber: prData.number,
          githubRepoFullName: payload.repository.full_name,
          provider: repository.provider,
        })

        logger.info({ prId: pr._id, prNumber: prData.number }, 'PR analysis queued')
      }

      if (action === 'closed' && prData.merged) {
        await PullRequestModel.findOneAndUpdate(
          { githubPrId: prData.id },
          { status: PRStatus.MERGED, mergedAt: new Date(prData.merged_at) }
        )
        logger.info({ prNumber: prData.number }, 'PR marked as merged')
      }

      if (action === 'closed' && !prData.merged) {
        await PullRequestModel.findOneAndUpdate(
          { githubPrId: prData.id },
          { status: PRStatus.DECLINED, declinedAt: new Date() }
        )
        logger.info({ prNumber: prData.number }, 'PR marked as declined (closed without merge)')
      }

      res.json({ success: true, data: { received: true } })
    } catch (error) {
      next(error)
    }
  }
}

export const webhookController = new WebhookController()

