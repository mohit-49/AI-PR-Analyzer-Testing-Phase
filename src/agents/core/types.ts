import { IGitProviderService } from '../../services/providers/git-provider.interface'
import { GitProvider } from '../../globals/enums'

export interface AgentRepoContext {
  provider: GitProvider
  providerService: IGitProviderService
  accessToken: string
  repoFullName: string
  branch: string
}

export interface AgentToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, { type: string; description: string }>
    required?: string[]
  }
}


export interface AgentTool {
  definition: AgentToolDefinition
  execute: (args: Record<string, unknown>, ctx: AgentRepoContext) => Promise<string>
  describeCall: (args: Record<string, unknown>) => string
}

export type AgentProgressCallback = (step: string) => void | Promise<void>
