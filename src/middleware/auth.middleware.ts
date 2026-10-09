import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { UnauthorizedError } from '../lib/errors'
import { JwtPayload } from '../globals/interfaces'
import { AuthenticatedRequest } from '../globals/types' 

export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided')
    }

    const token = authHeader.split(' ')[1]
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload

    ;(req as AuthenticatedRequest).user = payload
    next()
  } catch {
    next(new UnauthorizedError('Invalid or expired token'))
  }
}