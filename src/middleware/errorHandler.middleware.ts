import { Request, Response, NextFunction } from 'express'
import { AppError } from '../lib/errors'
import { logger } from '../lib/logger'

export const errorHandlerMiddleware = (
  error: Error, 
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error({ error, path: req.url, method: req.method }, 'API error')

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: { code: error.code, message: error.message },
    })
    return
  }

  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  })
}
