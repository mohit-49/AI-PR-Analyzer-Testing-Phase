import mongoose, { Schema, Document } from 'mongoose'
import { IBillingUsage } from '../globals/interfaces'
import { BillingAction } from '../globals/enums'

export type BillingUsageDocument = IBillingUsage & Document

const BillingUsageSchema = new Schema<BillingUsageDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: Object.values(BillingAction), required: true },
    tokensUsed: { type: Number, required: true },
    cost: { type: Number, default: 0 },
    prId: { type: Schema.Types.ObjectId, ref: 'PullRequest' },
    repositoryId: { type: Schema.Types.ObjectId, ref: 'Repository' },

    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    aiModel: { type: String, default: '' },
    llmProvider: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

BillingUsageSchema.index({ userId: 1 })
BillingUsageSchema.index({ createdAt: -1 })

export const BillingUsageModel = mongoose.model<BillingUsageDocument>('BillingUsage', BillingUsageSchema)
