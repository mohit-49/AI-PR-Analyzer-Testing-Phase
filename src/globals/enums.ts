export enum PRStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  MERGED = 'MERGED',
  DECLINED = 'DECLINED',
  DRAFT = 'DRAFT',
}

export enum AnalysisStatus {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED',
  ANALYZING = 'ANALYZING',
  DONE = 'DONE',
  FAILED = 'FAILED',
}

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum BillingPlan {
  FREE = 'FREE',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE',
}

export enum BillingAction {
  PR_ANALYSIS = 'PR_ANALYSIS',
  SKILL_GENERATION = 'SKILL_GENERATION',
  ISSUE_GENERATION = 'ISSUE_GENERATION',
  DOCUMENTATION = 'DOCUMENTATION',
  KNOWLEDGE_BASE = 'KNOWLEDGE_BASE',
}

export enum GitProvider {
  GITHUB = 'github',
  GITLAB = 'gitlab',
  BITBUCKET = 'bitbucket',
  AZURE = 'azure',
  CODECOMMIT = 'codecommit',
}

export enum SkillStatus {
  PENDING = 'PENDING',
  GENERATING = 'GENERATING',
  READY = 'READY',
  FAILED = 'FAILED',
}

export enum FeedbackType {
  BUG = 'BUG',
  FEATURE_REQUEST = 'FEATURE_REQUEST',
  IMPROVEMENT = 'IMPROVEMENT',
  OTHER = 'OTHER',
}
export enum FeedbackStatus {
  SUBMITTED = 'SUBMITTED',
  VIEWED = 'VIEWED',
  ANALYSIS = 'ANALYSIS',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  DELETED = 'DELETED',
}