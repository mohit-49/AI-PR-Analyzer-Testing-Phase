import { Types } from 'mongoose'
import { RepoSkillModel } from '../models/RepoSkill.model'

export async function deactivateAllVersions(repositoryId: string | Types.ObjectId): Promise<void> {
