import { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { UserModel } from '@/models/User.model'
import { env } from '@/config/env'
import { JWT_EXPIRES_IN } from '@/globals/constants'
import { ValidationError, UnauthorizedError } from '@/lib/errors'
import { logger } from '@/lib/logger'

const AdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const DUMMY_HASH = '$2a$12$CwTycUXDFGHWue0Thq9StjUM0uJ8Q8QQ8Q8QSDHKFNKGHQ8Q8QDFGHQ8DFGHQ8DFGHQ8Qe'

export class AdminAuthController {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = AdminLoginSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError('Email and password are required')
      const { email, password } = parsed.data

      const user = await UserModel.findOne({ email: email.toLowerCase(), role: 'admin' }).select(
        '+passwordHash email name role'
      )

      const hashToCompare = user?.passwordHash ?? DUMMY_HASH
      const isValid = await bcrypt.compare(password, hashToCompare)

      if (!user || !user.passwordHash || !isValid) {
        logger.warn({ email }, 'Failed admin login attempt')
        throw new UnauthorizedError('Invalid email or password')
      }

      const token = jwt.sign({ userId: user._id.toString(), role: user.role }, env.JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
      })

      logger.info({ userId: user._id.toString() }, 'Admin logged in')

      res.status(200).json({
        success: true,
        status: 200,
        message: 'Admin login successful.',
        data: {
          token,
          user: { id: user._id, name: user.name, email: user.email, role: user.role },
        },
      })
    } catch (error) {
      next(error)
    }
  }
}

export const adminAuthController = new AdminAuthController()