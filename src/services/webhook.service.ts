import crypto from 'crypto'
import { env } from '../config/env'
import { GitProvider } from '../globals/enums'
import { getProviderService } from './providers/provider-factory'
import { RepositoryModel } from '../models/Repository.model'
import { logger } from '../lib/logger'

export class WebhookService {
  generateSecret(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  async registerWebhook(
    provider: GitProvider,
    accessToken: string,
    repoFullName: string,
    repositoryId: string
  ): Promise<void> {
    const webhookSecret = this.generateSecret()
    const webhookPath = provider === GitProvider.BITBUCKET ? 'bitbucket' : provider === GitProvider.GITLAB ? 'gitlab' : 'github'
    const webhookUrl = `${process.env.WEBHOOK_BASE_URL}/api/webhooks/${webhookPath}`

    const providerService = getProviderService(provider)
    const webhookId = await providerService.registerWebhook(
      accessToken,
      repoFullName,
      webhookUrl,
      webhookSecret
    )

    await RepositoryModel.findByIdAndUpdate(repositoryId, {
      webhookId,
      webhookSecret,
    })

    logger.info({ repoFullName, webhookId, provider }, 'Webhook registered and saved')
  }

  async removeWebhook(
    provider: GitProvider,
    accessToken: string,
    repoFullName: string,
    webhookId: string
  ): Promise<void> {
    if (!webhookId) return

    const providerService = getProviderService(provider)
    await providerService.deleteWebhook(accessToken, repoFullName, webhookId)
  }
}

export const webhookService = new WebhookService()
