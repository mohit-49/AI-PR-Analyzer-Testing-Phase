import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { UnauthorizedError } from '../lib/errors'
import { JwtPayload } from '../globals/interfaces'
import { AuthenticatedRequest } from '../globals/types' 

export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  try {
