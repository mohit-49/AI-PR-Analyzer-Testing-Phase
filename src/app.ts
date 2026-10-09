import './config/env'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import path from 'path'
import { connectDatabase } from './config/database'
import { env } from './config/env'
import { logger } from './lib/logger'
import { errorHandlerMiddleware } from './middleware/errorHandler.middleware'
import { apiRateLimit } from './middleware/rateLimit.middleware'
import { FEEDBACK_UPLOAD_DIR, FEEDBACK_PUBLIC_PATH } from './middleware/feedback-upload.middleware'

// Routes
import authRoutes from './routes/auth.routes'
import repositoryRoutes from './routes/repository.routes'
import webhookRoutes from './routes/webhook.routes'
import analysisRoutes from './routes/analysis.routes'
import billingRoutes from './routes/billing.routes'
import healthRoutes from './routes/health.routes'
import skillRoutes from './routes/skill.routes'

// Workers — import to start them Redis
// import './queues/pr-analysis.worker'
// import '@/queues/skill-generation.worker'

import bitbucketWebhookRoutes from './routes/bitbucket-webhook.routes'
import codecommitWebhookRoutes from './routes/codecommit-webhook.routes'
import gitlabWebhookRoutes from './routes/gitlab-webhook.routes'

import adminAuthRoutes from './routes/admin/admin-auth.routes'
import adminRoutes from './routes/admin/admin.routes'

import feedbackRoutes from './routes/feedback.routes'

const app = express()

app.set('trust proxy', 1)

// Security headers
app.use(helmet())

// CORS
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }))

// Body parsing
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    ; (req as any).rawBody = buf
  },
})
)
app.use(express.urlencoded({ extended: true }))

app.use(
  '/uploads',
  express.static(path.join(process.cwd(), 'uploads'), {
    setHeaders: (res) => {
      res.set('Cross-Origin-Resource-Policy', 'cross-origin')
    },
  })
)

app.use(
  FEEDBACK_PUBLIC_PATH,
  express.static(FEEDBACK_UPLOAD_DIR, {
    maxAge: '7d',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff')
      // frontend (localhost:3000) aur backend (localhost:5000) alag origin hain
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    },
  })
)

// Global rate limit
app.use('/api', apiRateLimit)

// Routes
app.use('/api/health', healthRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/repositories', repositoryRoutes)
app.use('/api/webhooks', webhookRoutes)
app.use('/api/analysis', analysisRoutes)
app.use('/api/billing', billingRoutes)

app.use('/api/skills', skillRoutes)

app.use('/api/webhooks', bitbucketWebhookRoutes)
app.use('/api/webhooks', codecommitWebhookRoutes)
app.use('/api/webhooks', gitlabWebhookRoutes)

// Admin part 
app.use('/api/admin/auth', adminAuthRoutes)
app.use('/api/admin', adminRoutes)

app.use('/api/feedback', feedbackRoutes)

// Global error handler — must be last
app.use(errorHandlerMiddleware)

const start = async (): Promise<void> => {
  await connectDatabase()

  app.listen(env.PORT, () => {
    // logger.info(`Backend running on https://api-pranalyze.24livehost.com`)
    logger.info(`Backend running on http://localhost:5000`)
  })
}

start()
