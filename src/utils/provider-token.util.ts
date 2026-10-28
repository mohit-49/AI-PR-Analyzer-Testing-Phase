import { GitProvider } from '../globals/enums'
import { decryptToken } from './crypto.util'
import { AppError } from '../lib/errors'

export function getDecryptedTokenForProvider(
  user: { githubAccessToken?: string; bitbucketAccessToken?: string; gitlabAccessToken?: string },
  provider: GitProvider
): string {


  return decryptToken(encrypted)
}