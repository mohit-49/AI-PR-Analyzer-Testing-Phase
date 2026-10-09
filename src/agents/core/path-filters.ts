const EXCLUDED_PATH_SEGMENTS = ['node_modules/', '.git/', 'package-lock.json',]

export function isExcludedPath(path: string): boolean {
  const normalized = path.startsWith('/') ? path.slice(1) : path
  return EXCLUDED_PATH_SEGMENTS.some((segment) => normalized === segment.slice(0, -1) || normalized.includes(segment))
}