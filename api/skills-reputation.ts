type ReputationAudit = {
  provider: string
  status: string
  summary?: string
  auditedAt?: string
  riskLevel?: string
}

type ReputationResponse = {
  source: string
  skillName: string
  skillUrl: string
  localHash: string
  auditedHash?: string
  hashMatches: boolean
  installs?: number
  stars?: number
  audits: ReputationAudit[]
  verdict: string
  checkedAt: string
}

const skillIdPattern = /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/([a-z0-9_-]+)$/
const sha256Pattern = /^[a-f0-9]{64}$/i

const auditVerdict = (hashMatches: boolean, audits: ReputationAudit[]) => {
  if (!hashMatches) return 'Version not covered'
  if (audits.some((audit) => audit.status.toLowerCase() === 'fail')) return 'High risk'
  const passes = audits.filter((audit) => audit.status.toLowerCase() === 'pass').length
  const warns = audits.some((audit) => audit.status.toLowerCase() === 'warn')
  if (passes >= 2 && !warns) return 'Favorable'
  if (passes > 0 && warns) return 'Favorable with precautions'
  if (warns) return 'Review recommended'
  return 'Unknown'
}

const getJson = async (url: string, token?: string) => {
  const response = await fetch(url, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`skills.sh returned HTTP ${response.status}`)
  return response.json()
}

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'method_not_allowed' })
  }

  let body: any
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body ?? {}
  } catch {
    return response.status(400).json({ error: 'invalid_json' })
  }
  const match = typeof body.skillId === 'string' ? body.skillId.match(skillIdPattern) : null
  if (!match || typeof body.localHash !== 'string' || !sha256Pattern.test(body.localHash)) {
    return response.status(400).json({ error: 'invalid_request', message: 'Use skillId owner/repository/skill and a SHA-256 localHash.' })
  }

  const [, owner, repository, skillName] = match
  const source = `${owner}/${repository}`
  const baseUrl = 'https://skills.sh/api/v1/skills'
  const token = process.env.VERCEL_OIDC_TOKEN
  const detail = await getJson(`${baseUrl}/${owner}/${repository}/${skillName}`, token)
  const audit = await getJson(`${baseUrl}/audit/${owner}/${repository}/${skillName}`, token)
  if (!detail && !audit) return response.status(404).json({ error: 'not_found' })

  const audits: ReputationAudit[] = Array.isArray(audit?.audits) ? audit.audits.map((entry: any) => ({
    provider: typeof entry.provider === 'string' ? entry.provider : 'Unknown',
    status: typeof entry.status === 'string' ? entry.status : 'unknown',
    summary: typeof entry.summary === 'string' ? entry.summary : undefined,
    auditedAt: typeof entry.auditedAt === 'string' ? entry.auditedAt : undefined,
    riskLevel: typeof entry.riskLevel === 'string' ? entry.riskLevel : undefined,
  })) : []
  const auditedHash = typeof detail?.hash === 'string' ? detail.hash : typeof audit?.hash === 'string' ? audit.hash : undefined
  const hashMatches = Boolean(auditedHash && auditedHash.toLowerCase() === body.localHash.toLowerCase())
  const payload: ReputationResponse = {
    source,
    skillName,
    skillUrl: `https://skills.sh/${source}/${skillName}`,
    localHash: body.localHash,
    auditedHash,
    hashMatches,
    installs: typeof detail?.installs === 'number' ? detail.installs : undefined,
    stars: typeof detail?.stars === 'number' ? detail.stars : undefined,
    audits,
    verdict: auditVerdict(hashMatches, audits),
    checkedAt: new Date().toISOString(),
  }
  return response.status(200).json(payload)
}
