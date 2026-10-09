import { AgentTool } from '../types'
import { AGENT_SAFETY } from '../safety.config'
import { isExcludedPath } from '../path-filters'

export const searchFilesTool: AgentTool = {
  definition: {
    name: 'search_files',
    description:
      "Searches the whole repository's file list for paths matching a text pattern (case-insensitive substring match), e.g. 'config' or '.test.'",
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: "Text to search for within file paths, e.g. 'schema.prisma' or '.test.'" },
      },
      required: ['pattern'],
    },
  },
  describeCall: (args) => `Searching for files matching "${String(args.pattern ?? '')}"`,
  execute: async (args, ctx) => {
    const pattern = String(args.pattern ?? '').trim().toLowerCase()
    if (!pattern) return 'No search pattern was provided.'

    const { fileTree } = await ctx.providerService.getRepoContext(ctx.accessToken, ctx.repoFullName, ctx.branch)
    const matches = fileTree.filter((f) => !isExcludedPath(f) && f.toLowerCase().includes(pattern))

    if (matches.length === 0) {
      return `No files matched "${pattern}".`
    }

    const limited = matches.slice(0, AGENT_SAFETY.MAX_LISTING_ENTRIES)
    const suffix = matches.length > limited.length ? `\n...and ${matches.length - limited.length} more` : ''
    return limited.join('\n') + suffix
  },
}
