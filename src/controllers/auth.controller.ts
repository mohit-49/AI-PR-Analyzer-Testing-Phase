import { Request, Response, NextFunction } from 'express'
import axios from 'axios'
import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { UserModel } from '../models/User.model'
import { env } from '../config/env'
import { encryptToken, decryptToken } from '../utils/crypto.util'
import { JWT_EXPIRES_IN } from '../globals/constants'
import { GitProvider } from '../globals/enums'
import { logger } from '../lib/logger'
import { AppError, ValidationError, NotFoundError } from '../lib/errors'

const AVATAR_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'profileAvatar')

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  bio: z.string().max(300).optional(),
  company: z.string().max(120).optional(),
  location: z.string().max(120).optional(),
  blog: z.string().max(200).optional(),
})

function issueJwt(userId: string, plan: string): string {
  return jwt.sign({ userId, plan }, env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export class AuthController {

  // POST /api/auth/github/callback
  async githubCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { accessToken } = req.body as { accessToken: string }
      if (!accessToken) throw new AppError('Access token is required', 400, 'VALIDATION_ERROR')

      const userResponse = await axios.get('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const githubUser = userResponse.data

      let resolvedEmail = githubUser.email as string | null
      if (!resolvedEmail) {
        try {
          const emailsResponse = await axios.get('https://api.github.com/user/emails', {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          const primaryEmail = (emailsResponse.data as Array<{ email: string; primary: boolean }>).find(
            (e) => e.primary
          )
          resolvedEmail = primaryEmail?.email ?? null
        } catch {
          logger.warn({ githubId: githubUser.id }, 'Could not fetch private email from /user/emails')
        }
      }

      let user = await UserModel.findOne({ githubId: String(githubUser.id) })
      if (!user && resolvedEmail) {
        user = await UserModel.findOne({ email: resolvedEmail.toLowerCase() })
      }

      const githubFields = {
        githubId: String(githubUser.id),
        githubAccessToken: encryptToken(accessToken),
        avatarUrl: githubUser.avatar_url,
        bio: githubUser.bio || '',
        company: githubUser.company || '',
        location: githubUser.location || '',
        blog: githubUser.blog || '',
      }

      if (user) {
        user = await UserModel.findByIdAndUpdate(
          user._id,
          {
            $set: {
              ...githubFields,
              name: githubUser.name || githubUser.login || user.name,
              email: resolvedEmail?.toLowerCase() || user.email,
              lastLoginProvider: 'github',
            },
            $addToSet: { connectedProviders: GitProvider.GITHUB },
          },
          { new: true }
        )
      } else {
        user = await UserModel.create({
          email: (resolvedEmail || `${githubUser.login}@github.com`).toLowerCase(),
          name: githubUser.name || githubUser.login,
          ...githubFields,
          connectedProviders: [GitProvider.GITHUB],
        })
      }

      const jwtToken = issueJwt(user!._id.toString(), user!.plan)

      logger.info({ userId: user!._id.toString() }, 'User authenticated via GitHub')

      res.status(200).json({
        success: true,
        status: 200,
        message: 'User login with github successfully.',
        data: {
          token: jwtToken,
          user: { id: user!._id, name: user!.name, email: user!.email, avatarUrl: user!.avatarUrl, plan: user!.plan },
        },
      })
    } catch (error) {
      next(error)
    }
  }

  // POST /api/auth/bitbucket/callback
  async bitbucketCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { accessToken, refreshToken, expiresIn } = req.body as {
        accessToken: string
        refreshToken?: string
        expiresIn?: number
      }
      if (!accessToken) throw new AppError('Access token is required', 400, 'VALIDATION_ERROR')

      const userResponse = await axios.get('https://api.bitbucket.org/2.0/user', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const bbUser = userResponse.data

      let resolvedEmail: string | null = null
      try {
        const emailsResponse = await axios.get('https://api.bitbucket.org/2.0/user/emails', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const values = emailsResponse.data.values as Array<{ email: string; is_primary: boolean }>
        resolvedEmail = values.find((e) => e.is_primary)?.email ?? values[0]?.email ?? null
      } catch {
        logger.warn({ bitbucketUuid: bbUser.uuid }, 'Could not fetch email from Bitbucket')
      }

      if (!resolvedEmail) {
        throw new AppError(
          'Could not retrieve an email address from your Bitbucket account. Please make sure you have a verified email set.',
          400,
          'BITBUCKET_EMAIL_MISSING'
        )
      }

      let user = await UserModel.findOne({ bitbucketId: bbUser.uuid })
      if (!user) {
        user = await UserModel.findOne({ email: resolvedEmail.toLowerCase() })
      }

      const bitbucketFields = {
        bitbucketId: bbUser.uuid,
        bitbucketAccessToken: encryptToken(accessToken),
        bitbucketRefreshToken: refreshToken ? encryptToken(refreshToken) : undefined,
        bitbucketTokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
      }

      if (user) {
        user = await UserModel.findByIdAndUpdate(
          user._id,
          {
            $set: {
              ...bitbucketFields,
              name: user.name || bbUser.display_name || bbUser.username,
              bitbucketAvatarUrl: bbUser.links?.avatar?.href || '',
              lastLoginProvider: 'bitbucket',
            },
            $addToSet: { connectedProviders: GitProvider.BITBUCKET },
          },
          { new: true }
        )
      } else {
        user = await UserModel.create({
          email: resolvedEmail.toLowerCase(),
          name: bbUser.display_name || bbUser.username,
          bitbucketAvatarUrl: bbUser.links?.avatar?.href || '',
          ...bitbucketFields,
          connectedProviders: [GitProvider.BITBUCKET],
        })
      }

      const jwtToken = issueJwt(user!._id.toString(), user!.plan)

      logger.info({ userId: user!._id.toString() }, 'User authenticated via Bitbucket')

      res.status(200).json({
        success: true,
        status: 200,
        message: 'User login with bitbucket successfully.',
        data: {
          token: jwtToken,
          user: { id: user!._id, name: user!.name, email: user!.email, abitbucketAvatarUrlvatarUrl: user!.bitbucketAvatarUrl, plan: user!.plan },
        },
      })
    } catch (error) {
      next(error)
    }
  }

  // POST /api/auth/gitlab/callback
  async gitlabCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { accessToken, refreshToken, expiresIn } = req.body as {
        accessToken: string
        refreshToken?: string
        expiresIn?: number
      }
      if (!accessToken) throw new AppError('Access token is required', 400, 'VALIDATION_ERROR')

      const userResponse = await axios.get('https://gitlab.com/api/v4/user', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const gitlabUser = userResponse.data

      const resolvedEmail: string | null = gitlabUser.email ?? null
      if (!resolvedEmail) {
        throw new AppError(
          'Could not retrieve an email address from your GitLab account. Please make sure you have a verified email set.',
          400,
          'GITLAB_EMAIL_MISSING'
        )
      }

      let user = await UserModel.findOne({ gitlabId: String(gitlabUser.id) })
      if (!user) {
        user = await UserModel.findOne({ email: resolvedEmail.toLowerCase() })
      }

      const gitlabFields = {
        gitlabId: String(gitlabUser.id),
        gitlabAccessToken: encryptToken(accessToken),
        gitlabRefreshToken: refreshToken ? encryptToken(refreshToken) : undefined,
        gitlabTokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
        gitlabAvatarUrl: gitlabUser.avatar_url || '',
      }

      if (user) {
        user = await UserModel.findByIdAndUpdate(
          user._id,
          {
            $set: {
              ...gitlabFields,
              name: user.name || gitlabUser.name || gitlabUser.username,
              lastLoginProvider: 'gitlab',
            },
            $addToSet: { connectedProviders: GitProvider.GITLAB },
          },
          { new: true }
        )
      } else {
        user = await UserModel.create({
          email: resolvedEmail.toLowerCase(),
          name: gitlabUser.name || gitlabUser.username,
          ...gitlabFields,
          connectedProviders: [GitProvider.GITLAB],
        })
      }

      const jwtToken = issueJwt(user!._id.toString(), user!.plan)

      logger.info({ userId: user!._id.toString() }, 'User authenticated via GitLab')

      res.status(200).json({
        success: true,
        status: 200,
        message: 'User login with gitlab successfully.',
        data: {
          token: jwtToken,
          user: { id: user!._id, name: user!.name, email: user!.email, avatarUrl: user!.gitlabAvatarUrl, plan: user!.plan },
        },
      })
    } catch (error) {
      next(error)
    }
  }

  // GET /api/auth/me
  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = (req as any).user
      const user = await UserModel.findById(userId).select('-githubAccessToken -bitbucketAccessToken -gitlabAccessToken')
      if (!user) throw new AppError('User not found', 404, 'NOT_FOUND')

      res.status(200).json({
        success: true,
        status: 200,
        message: 'User profile fetch successfully.',
        data: { user }
      })
    } catch (error) {
      next(error)
    }
  }

  // PUT /api/auth/me/avatar — 
  async updateAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = (req as any).user
      const file = (req as any).file as Express.Multer.File | undefined
      if (!file) throw new ValidationError('No image uploaded')

      const user = await UserModel.findById(userId)
      if (!user) throw new NotFoundError('User not found')

      if (user.customAvatarUrl) {
        const oldFileName = user.customAvatarUrl.split('/').pop()
        if (oldFileName) {
          fs.unlink(path.join(AVATAR_UPLOAD_DIR, oldFileName), () => { })
        }
      }

      fs.mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true })
      const ext = path.extname(file.originalname) || '.jpg'
      const fileName = `${userId}-${Date.now()}${ext}`
      fs.writeFileSync(path.join(AVATAR_UPLOAD_DIR, fileName), file.buffer)

      const customAvatarUrl = `/uploads/profileAvatar/${fileName}`
      const updated = await UserModel.findByIdAndUpdate(userId, { customAvatarUrl }, { new: true }).select(
        '-githubAccessToken -bitbucketAccessToken -gitlabAccessToken'
      )

      logger.info({ userId }, 'Custom avatar updated')
      res.status(200).json({
        success: true,
        status: 200,
        message: 'User profile avatar updated successfully.',
        data: { user: updated }
      })
    } catch (error) {
      next(error)
    }
  }

  // PUT /api/auth/me/profile — 
  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = (req as any).user
      const parsed = UpdateProfileSchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError('Invalid profile data')

      const updates = parsed.data
      if (Object.keys(updates).length === 0) {
        throw new ValidationError('At least one field must be provided to update')
      }

      const user = await UserModel.findById(userId)
      if (!user) throw new NotFoundError('User not found')

      if (user.githubAccessToken) {
        const accessToken = decryptToken(user.githubAccessToken)
        try {
          await axios.patch('https://api.github.com/user', updates, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
        } catch (githubError: any) {
          const status = githubError?.response?.status
          if (status === 403 || status === 401) {
            throw new AppError(
              'GitHub sync failed — your GitHub login permissions are outdated. Please logout and login with GitHub again.',
              403,
              'GITHUB_SCOPE_OUTDATED'
            )
          }
          throw new AppError('Failed to sync profile with GitHub', 502, 'GITHUB_SYNC_FAILED')
        }
      }

      const updated = await UserModel.findByIdAndUpdate(userId, updates, { new: true }).select(
        '-githubAccessToken -bitbucketAccessToken -gitlabAccessToken'
      )

      logger.info({ userId }, 'Profile updated')
      res.status(200).json({
        success: true,
        status: 200,
        message: 'User profile data updated successfully.',
        data: { user: updated }
      })
    } catch (error) {
      next(error)
    }
  }

  // PUT /api/auth/me/bitbucket-profile — SIRF local save, koi external sync nahi
  async updateBitbucketProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = (req as any).user
      const schema = z.object({
        fullName: z.string().max(120).optional(),
        publicName: z.string().max(120).optional(),
        jobTitle: z.string().max(120).optional(),
        department: z.string().max(120).optional(),
        organization: z.string().max(120).optional(),
        basedIn: z.string().max(120).optional(),
        localTime: z.string().max(60).optional(),
        workingWithYou: z.string().max(300).optional(),
      })
      const parsed = schema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError('Invalid profile data')

      const updated = await UserModel.findByIdAndUpdate(
        userId,
        { bitbucketProfile: parsed.data },
        { new: true }
      ).select('-githubAccessToken -bitbucketAccessToken -gitlabAccessToken')

      res.json({ success: true, data: { user: updated } })
    } catch (error) {
      next(error)
    }
  }
}

export const authController = new AuthController()
