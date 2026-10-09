import mongoose, { Schema, Document } from 'mongoose'
import { IUser } from '../globals/interfaces'
import { BillingPlan, GitProvider } from '../globals/enums'

export type UserDocument = IUser & Document

const UserSchema = new Schema<UserDocument>(
  {
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    passwordHash: { type: String, select: false },

    isActive: { type: Boolean, default: true },

    email: { type: String, required: true, unique: true, lowercase: true },
    name: { type: String, required: true },
    avatarUrl: { type: String, default: '' },
    customAvatarUrl: { type: String, default: '' },
    bio: { type: String, default: '' },
    company: { type: String, default: '' },
    location: { type: String, default: '' },
    blog: { type: String, default: '' },

    bitbucketAvatarUrl: { type: String, default: '' },
    lastLoginProvider: { type: String, enum: ['github', 'bitbucket'], default: 'github' },
    bitbucketProfile: {
      fullName: { type: String, default: '' },
      publicName: { type: String, default: '' },
      jobTitle: { type: String, default: '' },
      department: { type: String, default: '' },
      organization: { type: String, default: '' },
      basedIn: { type: String, default: '' },
      localTime: { type: String, default: '' },
      workingWithYou: { type: String, default: '' },
    },

    githubId: { type: String, unique: true, sparse: true },
    githubAccessToken: { type: String },

    bitbucketId: { type: String, unique: true, sparse: true },
    bitbucketAccessToken: { type: String },
    bitbucketRefreshToken: { type: String },
    bitbucketTokenExpiresAt: { type: Date },

    gitlabAccessToken: { type: String },
    gitlabId: { type: String },
    gitlabRefreshToken: { type: String },
    gitlabTokenExpiresAt: { type: Date },
    gitlabAvatarUrl: { type: String },

    plan: {
      type: String,
      enum: Object.values(BillingPlan),
      default: BillingPlan.FREE,
    },
    tokenUsage: {
      used: { type: Number, default: 0 },
      limit: { type: Number, default: PLAN_LIMITS[BillingPlan.FREE].monthlyTokens },
      resetAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    },
    connectedProviders: {
      type: [String],
      enum: Object.values(GitProvider),
      default: [GitProvider.GITHUB],
    },

  },
  { timestamps: true }
)

export const UserModel = mongoose.model<UserDocument>('User', UserSchema)
