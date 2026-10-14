import { Job } from 'bullmq'
import { processPRAnalysis } from './pr-analysis.worker'
import { PullRequestModel } from '../models/PullRequest.model'
import { AnalysisStatus } from '../globals/enums'
import { PRAnalysisJobData } from '../globals/types'
// import { retryWithBackoff } from '../utils/retry.util'
import { logger } from '../lib/logger'

export const prAnalysisQueue = {
  add: async (_name: string, data: PRAnalysisJobData): Promise<void> => {
    const fakeJob = { data } as Job<PRAnalysisJobData>

    retryWithBackoff(() => processPRAnalysis(fakeJob), {
      attempts: 3,
      initialDelayMs: 5000,
      label: `PR analysis (pr #${data.prNumber})`,
    }).catch(async (error) => {
      logger.error({ error, pullRequestId: data.pullRequestId }, 'PR analysis job failed after all retries')
      if (data.pullRequestId) {
        await PullRequestModel.findByIdAndUpdate(data.pullRequestId, {
          analysisStatus: AnalysisStatus.FAILED,
        }).catch(() => {})
      }
    })
  },
}
