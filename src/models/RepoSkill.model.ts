import mongoose, { Schema, Document } from 'mongoose'
import { IRepoSkill } from '../globals/interfaces'
// import { SkillStatus } from '../globals/enums'

export type RepoSkillDocument = IRepoSkill & Document

const RepoSkillSchema = new Schema<RepoSkillDocument>(
  {
    repositoryId: { type: Schema.Types.ObjectId, ref: 'Repository', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: Object.values(SkillStatus), default: SkillStatus.PENDING },

    isActive: { type: Boolean, default: false },
    source: { type: String, enum: ['ai_generated', 'uploaded'], default: 'ai_generated' },
    fileName: { type: String },
    rawMarkdown: { type: String },
    summary: { type: String, default: '' },
    techStack: { type: [String], default: [] },
    conventions: { type: [String], default: [] },
    reviewFocusAreas: { type: [String], default: [] },
    rawModelOutput: { type: String },
    errorMessage: { type: String },
    aiModel: { type: String, default: '' },
    tokensUsed: { type: Number, default: 0 },
    generatedAt: { type: Date },
    lastEditedBy: { type: String, enum: ['ai', 'user'], default: 'ai' },
    lastEditedAt: { type: Date },

    generationMethod: { type: String, enum: ['single_shot', 'agent'], default: 'single_shot' },
    agentSteps: { type: [String], default: [] },
  },
  { timestamps: true }
)

RepoSkillSchema.index({ repositoryId: 1 })
RepoSkillSchema.index({ repositoryId: 1, isActive: 1 })

export const RepoSkillModel = mongoose.model<RepoSkillDocument>('RepoSkill', RepoSkillSchema)
