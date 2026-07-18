import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const locales = ['en', 'es', 'fr', 'zh', 'ja']

const readLocale = (locale) => {
  const file = path.join(root, 'src', 'locales', locale, 'translation.json')
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

const flatten = (value, prefix = '') => {
  const entries = []
  for (const [key, child] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object' && !Array.isArray(child)) entries.push(...flatten(child, fullKey))
    else entries.push([fullKey, child])
  }
  return entries
}

const placeholders = (value) => [...String(value).matchAll(/\{\{[^}]+\}\}/g)].map((match) => match[0]).sort().join('|')

const parsed = Object.fromEntries(locales.map((locale) => [locale, readLocale(locale)]))
const base = new Map(flatten(parsed.en))
const failures = []

for (const locale of locales.slice(1)) {
  const candidate = new Map(flatten(parsed[locale]))
  const missing = [...base.keys()].filter((key) => !candidate.has(key))
  const extra = [...candidate.keys()].filter((key) => !base.has(key))
  if (missing.length) failures.push(`${locale}: missing keys: ${missing.join(', ')}`)
  if (extra.length) failures.push(`${locale}: extra keys: ${extra.join(', ')}`)
  for (const [key, value] of base) {
    if (candidate.has(key) && placeholders(value) !== placeholders(candidate.get(key))) {
      failures.push(`${locale}: interpolation mismatch at ${key}`)
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log(`OK — ${locales.length} locales, ${base.size} keys, matching interpolations`)
