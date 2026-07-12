import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const scriptPath = join(process.cwd(), 'scripts/check-bundle-size.mjs')

function makeFixtureDist(mainBundleBytes: number) {
  const root = mkdtempSync(join(tmpdir(), 'jf-bundle-check-'))
  const distDir = join(root, 'dist')
  const assetsDir = join(distDir, 'assets')
  mkdirSync(assetsDir, { recursive: true })
  writeFileSync(join(distDir, 'index.html'), '<script type="module" src="/assets/index-test.js"></script>')
  writeFileSync(join(assetsDir, 'index-test.js'), 'x'.repeat(mainBundleBytes))
  return root
}

function run(cwd: string) {
  try {
    const stdout = execFileSync('node', [scriptPath], { cwd, encoding: 'utf8' })
    return { status: 0, stdout }
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string }
    return { status: e.status, stdout: e.stdout, stderr: e.stderr }
  }
}

describe('scripts/check-bundle-size.mjs', () => {
  it('exits 0 when the main bundle is under the budget', () => {
    const cwd = makeFixtureDist(300 * 1024)
    try {
      const result = run(cwd)
      expect(result.status).toBe(0)
      expect(result.stdout).toContain('within the 400 KB budget')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('exits 1 when the main bundle exceeds the budget', () => {
    const cwd = makeFixtureDist(401 * 1024)
    try {
      const result = run(cwd)
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('over the 400 KB budget')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
