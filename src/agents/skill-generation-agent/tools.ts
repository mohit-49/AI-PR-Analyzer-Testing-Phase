import { listDirectoryTool, readFileTool, searchFilesTool, finishTool } from '../core/tools'
import { AgentTool } from '../core/types'

export const skillAgentTools: AgentTool[] = [listDirectoryTool, readFileTool, searchFilesTool, finishTool]
