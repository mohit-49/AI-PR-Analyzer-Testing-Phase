import axios from 'axios'
import { env } from '@/config/env'
import { UserModel } from '@/models/User.model'
import { encryptToken, decryptToken } from '@/utils/crypto.util'
import { logger } from '@/lib/logger'

const REFRESH_BUFFER_MS = 5 * 60 * 1000 // token expire before 5 min refresh

export async function getValidBitbucketAccessToken(userId: string): Promise<string> {
  const user = await UserModel.findById(userId).select(
    'bitbucketAccessToken bitbucketRefreshToken bitbucketTokenExpiresAt'
  )
  if (!user?.bitbucketAccessToken) {
    throw new Error('User has not connected their Bitbucket account')
  }

  const expiresAt = user.bitbucketTokenExpiresAt?.getTime() ?? 0
  const isExpiringSoon = Date.now() >= expiresAt - REFRESH_BUFFER_MS

  if (!isExpiringSoon) {
    return decryptToken(user.bitbucketAccessToken)
  }

  if (!user.bitbucketRefreshToken) {
    logger.warn({ userId }, 'Bitbucket token expired and no refresh token available')
    return decryptToken(user.bitbucketAccessToken)
  }

  logger.info({ userId }, 'Refreshing Bitbucket access token')

  const refreshToken = decryptToken(user.bitbucketRefreshToken)

  const response = await axios.post(
    'https://bitbucket.org/site/oauth2/access_token',
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    {
      auth: { username: env.BITBUCKET_CLIENT_ID, password: env.BITBUCKET_CLIENT_SECRET },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  )

  const { access_token, refresh_token, expires_in } = response.data

  await UserModel.findByIdAndUpdate(userId, {
    bitbucketAccessToken: encryptToken(access_token),
    bitbucketRefreshToken: encryptToken(refresh_token),
    bitbucketTokenExpiresAt: new Date(Date.now() + expires_in * 1000),
  })

  return access_token
}