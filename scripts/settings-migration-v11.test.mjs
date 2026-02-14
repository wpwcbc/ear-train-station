import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const SETTINGS_TS = path.join(process.cwd(), 'src', 'lib', 'settings.ts')

function readSettingsSource() {
  return fs.readFileSync(SETTINGS_TS, 'utf8')
}

test('settings.ts keeps v10 → v11 migration (adds intervalHarmonicHelperWhen)', () => {
  const src = readSettingsSource()

  // Guard: storage key stays versioned.
  assert.ok(src.includes("const KEY = 'ets_settings_v11'"))
  assert.ok(src.includes("const KEY_V10 = 'ets_settings_v10'"))

  // Guard: the specific migration comment and defaults.
  assert.ok(src.includes('Migrate v10 → v11'))
  assert.match(
    src,
    /Migrate v10 → v11[\s\S]*?intervalHarmonicHelperWhen:\s*'always'/,
    'expected v10→v11 migration to default intervalHarmonicHelperWhen to always'
  )

  // Guard: we actually persist the migrated settings.
  assert.match(
    src,
    /Migrate v10 → v11[\s\S]*?saveSettings\(migrated\)/,
    'expected v10→v11 migration to call saveSettings(migrated)'
  )
})
