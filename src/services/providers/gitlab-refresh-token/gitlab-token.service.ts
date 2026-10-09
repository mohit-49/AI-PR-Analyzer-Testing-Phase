// this code current not used 

import axios from 'axios'
import { UserModel } from '../../../models/User.model'
import { encryptToken, decryptToken } from '@/utils/crypto.util'

const EXPIRY_BUFFER_MS = 60_000 

export async function getValidGitlabAccessToken(userId: string): Promise<string> {
  const user: any = await UserModel.findById(userId).select(
    'gitlabAccessToken gitlabRefreshToken gitlabTokenExpiresAt'
  )
  if (!user?.gitlabAccessToken) throw new Error('GitLab not connected')

  const expiresAt = user.gitlabTokenExpiresAt ? new Date(user.gitlabTokenExpiresAt).getTime() : 0
  if (expiresAt - EXPIRY_BUFFER_MS > Date.now()) {
    return decryptToken(user.gitlabAccessToken)
  }

  if (!user.gitlabRefreshToken) throw new Error('GitLab session expired, please reconnect')

  const { data } = await axios.post('https://gitlab.com/oauth/token', {
    grant_type: 'refresh_token',
    refresh_token: decryptToken(user.gitlabRefreshToken),
    client_id: process.env.GITLAB_CLIENT_ID,
    client_secret: process.env.GITLAB_CLIENT_SECRET,
    redirect_uri: process.env.GITLAB_REDIRECT_URI,
  })

  user.gitlabAccessToken = encryptToken(data.access_token)
  user.gitlabRefreshToken = encryptToken(data.refresh_token)
  user.gitlabTokenExpiresAt = new Date((data.created_at + data.expires_in) * 1000)
  await user.save()

  return data.access_token
}