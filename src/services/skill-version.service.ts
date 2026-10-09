import { Types } from 'mongoose'
import { RepoSkillModel } from '../models/RepoSkill.model'

export async function deactivateAllVersions(repositoryId: string | Types.ObjectId): Promise<void> {
  await RepoSkillModel.updateMany({ repositoryId, isActive: true }, { isActive: false })
}

export async function activateSkillVersion(
  repositoryId: string | Types.ObjectId,
  skillId: string | Types.ObjectId
) {
  await deactivateAllVersions(repositoryId)
  return RepoSkillModel.findByIdAndUpdate(skillId, { isActive: true }, { new: true })
}
