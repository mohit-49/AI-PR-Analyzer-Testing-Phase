import mongoose, { Schema, Document } from 'mongoose'
import { IFeedback } from '../globals/interfaces'
import { FeedbackType, FeedbackStatus } from '../globals/enums'

export type FeedbackDocument = IFeedback & Document

const StatusEntrySchema = new Schema(
  {
    status: { type: String, enum: Object.values(FeedbackStatus), required: true },
    note: { type: String, default: '' },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
)

const FeedbackSchema = new Schema<FeedbackDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(FeedbackType), required: true },
    title: { type: String, required: true, maxlength: 1500 },
    description: { type: String, required: true, maxlength: 30000 },
    screenshots: { type: [String], default: [] }, 
    status: { type: String, enum: Object.values(FeedbackStatus), default: FeedbackStatus.SUBMITTED },
    statusHistory: { type: [StatusEntrySchema], default: [] },
  },
  { timestamps: true }
)

FeedbackSchema.index({ userId: 1, createdAt: -1 })
FeedbackSchema.index({ status: 1 })

export const FeedbackModel = mongoose.model<FeedbackDocument>('Feedback', FeedbackSchema)