import { AgentTool } from '../types'
import { AGENT_SAFETY } from '../safety.config'
import { isExcludedPath } from '../path-filters'

export const listDirectoryTool: AgentTool = {
  definition: {
    name: 'list_directory',
    description:
      "Li || '.'}" (path may not exist, or the repo file list is empty).`
    }

    const limited = entries.slice(0, AGENT_SAFETY.MAX_LISTING_ENTRIES)
    const lines = limited.map((e) => (e.type === 'dir' ? `${e.path}/` : e.path))
    const suffix = entries.length > limited.length ? `\n...and ${entries.length - limited.length} more` : ''
    return lines.join('\n') + suffix
  },
}
