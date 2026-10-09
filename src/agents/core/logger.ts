import { logger } from '../../lib/logger'

export function getAgentLogger(agentName: string) {
  return logger.child({ module: 'agent', agent: agentName })
}
