import { AgentTool } from '../types'

export const finishTool: AgentTool = {
  definition: {

  },
  describeCall: (args) => `Finalizing — ${String(args.reason ?? 'gathered enough context')}`,
  execute: async (args) => `Acknowledged: ${String(args.reason ?? 'finishing up')}`,
}
