import { AgentTool } from '../types'

export const finishTool: AgentTool = {
  definition: {
    name: 'finish_analysis',
    description: 'Call this once you have gathered enough information to produce your final answer.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'One short sentence on why you have enough information now.' },
      },
    },
  },
  describeCall: (args) => `Finalizing — ${String(args.reason ?? 'gathered enough context')}`,
  execute: async (args) => `Acknowledged: ${String(args.reason ?? 'finishing up')}`,
}
