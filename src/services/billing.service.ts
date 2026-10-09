import { Types } from 'mongoose'
import { UserModel } from '../models/User.model'
import { BillingUsageModel } from '../models/BillingUsage.model'
import { BillingAction } from '../globals/enums'
import { logger } from '../lib/logger'

export class BillingService {
  async recordUsage(params: {
    userId: string
    action: BillingAction
    tokensUsed: number
    inputTokens?: number
    outputTokens?: number
    aiModel?: string
    llmProvider?: string
    prId?: string
    repositoryId?: string
  }): Promise<void> {
    const { userId, action, tokensUsed, inputTokens, outputTokens, aiModel, llmProvider, prId, repositoryId } = params

    await BillingUsageModel.create({
      userId: new Types.ObjectId(userId),
      action,
      tokensUsed,
      inputTokens: inputTokens ?? 0,
      outputTokens: outputTokens ?? 0,
      aiModel: aiModel ?? '',
      llmProvider: llmProvider ?? '',
      cost: 0,
      prId: prId ? new Types.ObjectId(prId) : undefined,
      repositoryId: repositoryId ? new Types.ObjectId(repositoryId) : undefined,
    })

    await UserModel.findByIdAndUpdate(userId, {
      $inc: { 'tokenUsage.used': tokensUsed },
    })

    logger.info({ userId, action, tokensUsed, aiModel, llmProvider }, 'Billing usage recorded')
  }

  async getMonthlyUsage(userId: string): Promise<{ totalTokens: number; byAction: Record<string, number> }> {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const usages = await BillingUsageModel.find({
      userId: new Types.ObjectId(userId),
      createdAt: { $gte: startOfMonth },
    })

    const byAction: Record<string, number> = {}
    let totalTokens = 0

    for (const usage of usages) {
      totalTokens += usage.tokensUsed
      byAction[usage.action] = (byAction[usage.action] || 0) + usage.tokensUsed
    }

    return { totalTokens, byAction }
  }
}

export const billingService = new BillingService()
