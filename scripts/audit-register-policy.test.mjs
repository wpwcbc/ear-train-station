import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { auditRegisterPolicy } from './audit-register-policy.mjs'

function mkTmpRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ets-audit-'))
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  return root
}

test('audit passes when no magic register numbers present', () => {
  const root = mkTmpRepo()
  fs.writeFileSync(
    path.join(root, 'src', 'ok.ts'),
    `export const x = { minMidi: STABLE_REGISTER_MIN_MIDI, maxMidi: STABLE_REGISTER_MAX_MIDI }\n`
  )

  const res = auditRegisterPolicy({ root })
  assert.equal(res.ok, true)
  assert.deepEqual(res.errors, [])
})

test('audit fails on magic 60/71 and 43', () => {
  const root = mkTmpRepo()
  fs.writeFileSync(
    path.join(root, 'src', 'bad.ts'),
    `export const a = { minMidi: 60, maxMidi: 71 }\nexport const b = { rootMinMidi: 43 }\n`
  )

  const res = auditRegisterPolicy({ root })
  assert.equal(res.ok, false)
  assert.ok(res.errors.some((e) => e.includes("'minMidi: 60'")))
  assert.ok(res.errors.some((e) => e.includes("'maxMidi: 71'")))
  assert.ok(res.errors.some((e) => e.includes("'rootMinMidi: 43'")))
})
