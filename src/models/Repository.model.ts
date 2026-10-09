import mongoose, { Schema, Document, Types } from 'mongoose'
import { IRepository } from '../globals/interfaces'
import { GitProvider } from '../globals/enums'

export type RepositoryDocument = IRepository & Document

const RepositorySchema = new Schema<RepositoryDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: String, enum: Object.values(GitProvider), default: GitProvider.GITHUB },
    repoId: { type: String, required: true },
    fullName: { type: String, required: true },
    defaultBranch: { type: String, default: 'main' },
    webhookId: { type: String, default: '' },
    webhookSecret: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    isPrivate: { type: Boolean, default: false },
    monitorConfig: {
      watchPRs: { type: Boolean, default: true },
      watchCommits: { type: Boolean, default: true },
      watchReleases: { type: Boolean, default: true },
      watchDocs: { type: Boolean, default: false },
      watchIssues: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
)

RepositorySchema.index({ userId: 1 })
RepositorySchema.index({ repoId: 1, provider: 1 })

export const RepositoryModel = mongoose.model<RepositoryDocument>('Repository', RepositorySchema)
