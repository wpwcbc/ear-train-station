#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SRC_DIR = path.join(ROOT, 'src')

const EXCLUDE = new Set([
  path.normalize('src/lib/registerPolicy.ts'),
])

const TARGET_EXT = new Set(['.ts', '.tsx'])

const RULES = [
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

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/')
}

const files = walk(SRC_DIR)
  .filter((p) => TARGET_EXT.has(path.extname(p)))
  .filter((p) => !EXCLUDE.has(path.normalize(rel(p))))

let ok = true

for (const f of files) {
  const content = fs.readFileSync(f, 'utf8')
  for (const rule of RULES) {
    for (const { re, hint } of rule.patterns) {
      re.lastIndex = 0
      const matches = [...content.matchAll(re)]
      if (matches.length === 0) continue
      ok = false
      console.error(`\n❌ ${rel(f)} — ${rule.name}`)
      for (const m of matches) {
        const idx = m.index ?? 0
        const before = content.slice(0, idx)
        const line = before.split('\n').length
        console.error(`  line ${line}: '${m[0]}' → ${hint}`)
      }
    }
  }
}

if (!ok) {
  console.error('\nRegister policy audit failed. Fix magic numbers, then re-run: npm run audit:register')
  process.exit(1)
}

console.log('✅ Register policy audit passed.')
