#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

export const DEFAULT_EXCLUDE = new Set([
  path.normalize('src/lib/registerPolicy.ts'),
])

export const TARGET_EXT = new Set(['.ts', '.tsx'])

export const RULES = [
  {
    name: 'Stable lesson register should come from STABLE_REGISTER_* (no magic 60/71)',
    // Flag common station/exercise option shapes.
    patterns: [
      { re: /\b(minMidi|maxMidi|rootMidi|startMidi)\s*:\s*60\b/g, hint: 'Use STABLE_REGISTER_MIN_MIDI' },
      { re: /\b(maxMidi|endMidi)\s*:\s*71\b/g, hint: 'Use STABLE_REGISTER_MAX_MIDI' },
    ],
  },
  {
    name: 'Wide register min (G2) should come from WIDE_REGISTER_MIN_MIDI (no magic 43)',
    patterns: [
      { re: /\b(rootMinMidi|minRootMidi|tonicMinMidi|minMidi)\s*:\s*43\b/g, hint: 'Use WIDE_REGISTER_MIN_MIDI' },
    ],
  },
]

function walk(dir) {
  const out = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

function rel(root, p) {
  return path.relative(root, p).split(path.sep).join('/')
}

/**
 * Audits the register policy in a given repo root.
 *
 * By default, this audits `${root}/src`.
 */
export function auditRegisterPolicy({ root = process.cwd(), srcDir, exclude = DEFAULT_EXCLUDE } = {}) {
  const ROOT = path.resolve(root)
  const SRC_DIR = srcDir ? path.resolve(ROOT, srcDir) : path.join(ROOT, 'src')

  if (!fs.existsSync(SRC_DIR)) {
    return { ok: false, errors: [`Missing src dir: ${rel(ROOT, SRC_DIR)}`] }
  }

  const files = walk(SRC_DIR)
    .filter((p) => TARGET_EXT.has(path.extname(p)))
    .filter((p) => !exclude.has(path.normalize(rel(ROOT, p))))

  const errors = []

  for (const f of files) {
    const content = fs.readFileSync(f, 'utf8')
    for (const rule of RULES) {
      for (const { re, hint } of rule.patterns) {
        re.lastIndex = 0
        const matches = [...content.matchAll(re)]
        if (matches.length === 0) continue
        for (const m of matches) {
          const idx = m.index ?? 0
          const before = content.slice(0, idx)
          const line = before.split('\n').length
          errors.push(`${rel(ROOT, f)}:${line}: '${m[0]}' → ${hint} (${rule.name})`)
        }
      }
    }
  }

  return { ok: errors.length === 0, errors }
}

function main() {
  const argRoot = process.argv[2] || process.env.AUDIT_ROOT
  const { ok, errors } = auditRegisterPolicy({ root: argRoot ?? process.cwd() })

  if (!ok) {
    for (const e of errors) console.error(`\n❌ ${e}`)
    console.error('\nRegister policy audit failed. Fix magic numbers, then re-run: npm run audit:register')
    process.exit(1)
  }

  console.log('✅ Register policy audit passed.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
