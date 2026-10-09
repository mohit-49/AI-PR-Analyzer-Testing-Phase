import { GitProvider } from '../globals/enums'
import { decryptToken } from './crypto.util'
import { AppError } from '../lib/errors'

export function getDecryptedTokenForProvider(
  user: { githubAccessToken?: string; bitbucketAccessToken?: string; gitlabAccessToken?: string },
  provider: GitProvider
): string {
  const encrypted =
    provider === GitProvider.BITBUCKET
      ? user.bitbucketAccessToken
      : provider === GitProvider.GITLAB
      ? user.gitlabAccessToken
      : user.githubAccessToken

  if (!encrypted) {
    throw new AppError(
      `User has not connected their ${provider} account`,
      400,
      'PROVIDER_NOT_CONNECTED'
    )
  }

  return decryptToken(encrypted)
}