import { BillingPlan } from './enums' 

export const QUEUE_NAMES = {
  PR_ANALYSIS: 'pr-analysis',
  DOCUMENTATION: 'documentation',
  SKILL_GENERATION: 'skill-generation',
} as const

export const PLAN_LIMITS: Record<BillingPlan, { monthlyTokens: number; prAnalysisPerDay: number }> = {
  [BillingPlan.FREE]: { monthlyTokens: 100_000, prAnalysisPerDay: 10 },
  [BillingPlan.PRO]: { monthlyTokens: 1_000_000, prAnalysisPerDay: 100 },
  [BillingPlan.ENTERPRISE]: { monthlyTokens: Infinity, prAnalysisPerDay: Infinity },
}

export const RISK_WEIGHTS = {
  LINES_CHANGED: 0.3,
  FILES_CHANGED: 0.2,
  CRITICAL_FILES: 0.5,
} as const

export const CRITICAL_FILE_PATTERNS = [
  /auth/i,
  /payment/i,
  /billing/i,
  /schema/i,
  /migration/i,
  /security/i,
  /config/i,
  /\.env/i,
] as const

export const JWT_EXPIRES_IN = '7d' as const

export const WEBHOOK_EVENTS = ['pull_request', 'push', 'release'] as const