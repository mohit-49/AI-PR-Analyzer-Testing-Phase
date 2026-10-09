import { AgentTool } from '../types'
import { AGENT_SAFETY } from '../safety.config'
import { isExcludedPath } from '../path-filters'

export const listDirectoryTool: AgentTool = {
  definition: {
    name: 'list_directory',
    description:
      "Lists the files and sub-folders directly inside a directory of the repository. Use an empty string for the repository root.",
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: "Directory path relative to repo root, e.g. 'src' or '' for root." },
      },
      required: ['path'],
    },
  },
  describeCall: (args) => {
    const path = String(args.path ?? '').trim()
    return path ? `Exploring ${path}/ folder` : 'Exploring repository root'
  },
  execute: async (args, ctx) => {
    const path = String(args.path ?? '').trim()
    const rawEntries = await ctx.providerService.listDirectory(ctx.accessToken, ctx.repoFullName, ctx.branch, path)
    const entries = rawEntries.filter((e) => !isExcludedPath(path ? `${path}/${e.path}` : e.path))

    if (entries.length === 0) {
      return `No entries found under "${path || '.'}" (path may not exist, or the repo file list is empty).`
    }

    const limited = entries.slice(0, AGENT_SAFETY.MAX_LISTING_ENTRIES)
    const lines = limited.map((e) => (e.type === 'dir' ? `${e.path}/` : e.path))
    const suffix = entries.length > limited.length ? `\n...and ${entries.length - limited.length} more` : ''
    return lines.join('\n') + suffix
  },
}
