import { Router } from 'express'
import { gitlabWebhookController } from '../controllers/gitlab-webhook.controller'
import { gitlabWebhookVerify } from '../middleware/gitlabWebhookVerify.middleware'
import { webhookRateLimit } from '../middleware/rateLimit.middleware'

const router = Router()

router.post(
  '/gitlab',
  webhookRateLimit,
  gitlabWebhookVerify,
  gitlabWebhookController.handleMergeRequestEvent.bind(gitlabWebhookController)
)

export default router