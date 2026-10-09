import { StateGraph, START, END } from '@langchain/langgraph'
import { SkillAgentState } from './state'
import { agentThinkNode } from './nodes/agent-think.node'
import { executeToolNode } from './nodes/execute-tool.node'
import { generateFinalAnswerNode } from './nodes/generate-final-answer.node'
import { shouldContinue } from './edges'

export function buildSkillGenerationAgentGraph() {
  const graph = new StateGraph(SkillAgentState)
    .addNode('agentThink', agentThinkNode)
    .addNode('executeTool', executeToolNode)
    .addNode('generateFinalAnswer', generateFinalAnswerNode)

    .addEdge(START, 'agentThink')
    .addEdge('agentThink', 'executeTool')
    .addConditionalEdges('executeTool', shouldContinue, {
      agentThink: 'agentThink',
      generateFinalAnswer: 'generateFinalAnswer',
    })
    .addEdge('generateFinalAnswer', END)

  return graph.compile()
}
