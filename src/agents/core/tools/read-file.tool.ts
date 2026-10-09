import { AgentTool } from '../types'
import { AGENT_SAFETY } from '../safety.config'
import { isExcludedPath } from '../path-filters'

export const readFileTool: AgentTool = {
  definition: {
    name: 'read_file',
    description: "Reads the content of a single file in the repository, given its path.",
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: "File path relative to repo root, e.g. 'package.json' or 'src/app.ts'." },
      },
      required: ['path'],
    },
  },
  describeCall: (args) => `Reading ${String(args.path ?? 'file')}`,
  execute: async (args, ctx) => {
    const path = String(args.path ?? '').trim()
    if (!path) return 'No path was provided.'

    if (isExcludedPath(path)) {
      return `Skipped — "${path}" is inside node_modules/ (or .git/) and is not analyzed.`
    }

    const content = await ctx.providerService.readFile(ctx.accessToken, ctx.repoFullName, ctx.branch, path)
    if (content === null) {
      return `Could not read "${path}" — it may not exist on this branch.`
    }

    if (content.length > AGENT_SAFETY.MAX_TOOL_RESULT_CHARS) {
      return (
        content.slice(0, AGENT_SAFETY.MAX_TOOL_RESULT_CHARS) +
        `\n...[truncated — file is longer than ${AGENT_SAFETY.MAX_TOOL_RESULT_CHARS} characters]`
      )
    }
    return content
  },
}
