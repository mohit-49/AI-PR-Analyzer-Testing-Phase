import { GitProvider } from '../../globals/enums'
import { githubService } from '../github.service'
import { bitbucketService } from './bitbucket.service'
import { IGitProviderService } from './git-provider.interface'
import { AppError } from '../../lib/errors'
import { codecommitService } from './codecommit.service'
import { gitlabService } from './gitlab.service'

export function getProviderService(provider: GitProvider): IGitProviderService {
  switch (provider) {
    case GitProvider.GITHUB:
      return githubService
    case GitProvider.BITBUCKET:
      return bitbucketService
    case GitProvider.GITLAB:
      return gitlabService
    case GitProvider.CODECOMMIT:
      return codecommitService
    default:
      throw new AppError(`Unsupported git provider: ${provider}`, 400, 'UNSUPPORTED_PROVIDER')
  }
}
