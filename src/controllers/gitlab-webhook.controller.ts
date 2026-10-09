import { Request, Response, NextFunction } from 'express'
import { PullRequestModel } from '../models/PullRequest.model'
import { prAnalysisQueue } from '../queues/pr-analysis.queue'
import { GitProvider, AnalysisStatus } from '../globals/enums'
import { logger } from '../lib/logger'

export class GitLabWebhookController {
  async handleMergeRequestEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body
      const repository = (req as any).matchedRepository
      if (body.object_kind !== 'merge_request') {
        res.status(200).json({ success: true, message: 'Ignored — not a merge_request event' })
        return
      }

      const action = body.object_attributes?.action
      const mrIid = body.object_attributes?.iid

      if (!['open', 'update', 'reopen'].includes(action)) {
        res.status(200).json({ success: true, message: `Ignored — action "${action}" not analyzed` })
        return
      }

      logger.info({ repoFullName: repository.fullName, mrIid, action }, 'GitLab webhook received')

      // const attrs = body.object_attributes ?? {}
      // const pr = await PullRequestModel.findOneAndUpdate(
      //   { repositoryId: repository._id, prNumber: mrIid },
      //   {
      //     repositoryId: repository._id,
      //     userId: repository.userId,
      //     prNumber: mrIid,
      //     title: attrs.title ?? `MR !${mrIid}`,
      //     description: attrs.description ?? '',
      //     author: body.user?.username ?? body.user?.name ?? 'unknown',
      //     baseBranch: attrs.target_branch ?? '',
      //     headBranch: attrs.source_branch ?? '',
      //     analysisStatus: AnalysisStatus.PENDING,
      //   },
      //   { upsert: true, new: true }
      // )
      const attrs = body.object_attributes ?? {}
      const pr = await PullRequestModel.findOneAndUpdate(
        { repositoryId: repository._id, prNumber: mrIid },
        {
          repositoryId: repository._id,
          userId: repository.userId,
          prNumber: mrIid,
          title: attrs.title ?? `MR !${mrIid}`,
          description: attrs.description ?? '',
          author: body.user?.username ?? body.user?.name ?? 'unknown',
          baseBranch: attrs.target_branch ?? '',
          headBranch: attrs.source_branch ?? '',
          githubUrl: attrs.url ?? '',
          githubPrId: attrs.id,
          analysisStatus: AnalysisStatus.PENDING,
        },
        { upsert: true, new: true }
      )

      await prAnalysisQueue.add('analyze-pr', {
        pullRequestId: pr._id.toString(),
        repositoryId: repository._id.toString(),
        userId: repository.userId.toString(),
        prNumber: mrIid,
        githubRepoFullName: repository.fullName,
        provider: GitProvider.GITLAB,
      })

      res.status(200).json({ success: true, message: 'Analysis queued' })
    } catch (error) {
      next(error)
    }
  }
}

export const gitlabWebhookController = new GitLabWebhookController()