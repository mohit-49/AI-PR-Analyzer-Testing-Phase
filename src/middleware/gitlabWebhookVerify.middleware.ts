import { Request, Response, NextFunction } from 'express'
import { RepositoryModel } from '../models/Repository.model'
import { GitProvider } from '../globals/enums'
import { UnauthorizedError } from '../lib/errors'
import { logger } from '../lib/logger'

.webhookSecret || token !== repository.webhookSecret) {
      logger.warn({ repoFullName }, 'GitLab webhook — token mismatch')
      throw new UnauthorizedError('Invalid webhook token')
    }

    ; (req as any).matchedRepository = repository
    next()
  } catch (error) {
    next(error)
  }
}