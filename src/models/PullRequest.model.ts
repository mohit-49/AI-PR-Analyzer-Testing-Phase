import mongoose, { Schema, Document } from 'mongoose'
import { IPullRequest } from '../globals/interfaces'
import { PRStatus, AnalysisStatus } from '../globals/enums'

export type PullRequestDocument = IPullRequest & Document

const PullRequestSchema = new Schema<PullRequestDocument>(
  {
    repositoryId: { type: Schema.Types.ObjectId, ref: 'Repository', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    prNumber: { type: Number, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    author: { type: String, required: true },
    baseBranch: { type: String, required: true },
    headBranch: { type: String, required: true },
    mergedAt: { type: Date },
    mergedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    mergeMethod: { type: String, enum: ['merge', 'squash', 'rebase'] },
    declinedAt: { type: Date },
    declinedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    declineReason: { type: String },
    changedFiles: [
      {
        filename: String,
        status: { type: String, enum: ['added', 'modified', 'deleted', 'renamed'] },
        additions: Number,
        deletions: Number,
        patch: String,
      },
    ],
    status: { type: String, enum: Object.values(PRStatus), default: PRStatus.OPEN },
    analysisStatus: {
      type: String,
      enum: Object.values(AnalysisStatus),
      default: AnalysisStatus.PENDING,
    },
    githubUrl: { type: String },
    githubPrId: { type: Number },
    // githubPrId: { type: Number, required: true },
    // githubUrl: { type: String, required: true },
    seenAt: { type: Date, default: null }
  },
  { timestamps: true }
)

PullRequestSchema.index({ repositoryId: 1 })
PullRequestSchema.index({ userId: 1 })
PullRequestSchema.index({ prNumber: 1, repositoryId: 1 })
PullRequestSchema.index({ createdAt: -1 })

export const PullRequestModel = mongoose.model<PullRequestDocument>('PullRequest', PullRequestSchema)
