import mongoose, { Schema, Document } from 'mongoose'
import { IAnalysis } from '../globals/interfaces'
import { RiskLevel } from '../globals/enums'

export type AnalysisDocument = IAnalysis & Document

const AnalysisSchema = new Schema<AnalysisDocument>(
  {
    pullRequestId: { type: Schema.Types.ObjectId, ref: 'PullRequest', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    summary: { type: String, required: true },
    riskLevel: { type: String, enum: Object.values(RiskLevel), required: true },
    riskScore: { type: Number, min: 0, max: 100, required: true },
    riskReasons: [{ type: String }],
    testingSuggestions: [
      {
        area: String,
        suggestion: String,
        priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'] },
      },
    ],
    reviewComments: [
      {
        file: String,
        line: Number,
        comment: String,
        severity: { type: String, enum: ['INFO', 'WARNING', 'ERROR'] },
      },
    ],

    mergeVerdict: {
      type: String,
      enum: ['READY', 'NEEDS_CHANGES', 'NEEDS_DISCUSSION'],
      required: true,
    },

    securityFindings: [
      {
        file: { type: String, required: true },
        issue: { type: String, required: true },
        severity: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW'], required: true },
      },
    ],

    breakingChanges: [{ type: String }],

    testCoverageGap: {
      hasGap: { type: Boolean, default: false },
      note: { type: String, default: '' },
    },

    analysisCoverage: {
      isPartial: { type: Boolean, default: false },
      totalFilesChanged: { type: Number, default: 0 },
      filesAnalyzed: { type: Number, default: 0 },
      filesTruncated: { type: Number, default: 0 },
    },

    aiModel: { type: String, required: true },
    tokensUsed: { type: Number, required: true },
    processingTimeMs: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

AnalysisSchema.index({ pullRequestId: 1 })
AnalysisSchema.index({ userId: 1 })
AnalysisSchema.index({ createdAt: -1 })

export const AnalysisModel = mongoose.model<AnalysisDocument>('Analysis', AnalysisSchema)
