import { Router } from 'express'
import { codecommitWebhookController } from '@/controllers/codeCommit/codecommit-webhook.controller'
import { webhookRateLimit } from '../middleware/rateLimit.middleware'
import { codecommitWebhookVerify } from '../middleware/codecommitWebhookVerify.middleware'

const router = Router()

router.post(
  '/codecommit',
  webhookRateLimit,
  codecommitWebhookVerify,
  codecommitWebhookController.handlePullRequestEvent.bind(codecommitWebhookController)
)

export default router