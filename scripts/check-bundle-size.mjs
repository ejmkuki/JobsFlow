#!/usr/bin/env node
// Phase H #4: fails the build if the main entry bundle grows past its
// budget, so a regression is caught at build time rather than discovered
// later as a slow first paint. Only the main entry chunk is budgeted — every
// dashboard page/route is expected to be lazy-loaded into its own chunk (see
// src/App.tsx), so those growing is normal and not what this guards against.
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const distDir = join(process.cwd(), 'dist')
const MAIN_BUNDLE_BUDGET_BYTES = 400 * 1024

function findMainEntryScriptSrc() {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8')
  const match = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)
  if (!match) {
    throw new Error('Could not find the main module script tag in dist/index.html.')
  }
  return match[1]
}

function main() {
  const src = findMainEntryScriptSrc()
  const filePath = join(distDir, src.replace(/^\//, ''))
  const { size } = statSync(filePath)
  const kb = (size / 1024).toFixed(1)
  const budgetKb = (MAIN_BUNDLE_BUDGET_BYTES / 1024).toFixed(0)

  if (size > MAIN_BUNDLE_BUDGET_BYTES) {
    console.error(`✗ Main bundle (${src}) is ${kb} KB — over the ${budgetKb} KB budget.`)
    console.error('  A new dashboard page/route should be lazy-loaded (see src/App.tsx) rather than added to the eager bundle.')
    process.exit(1)
  }

  console.log(`✓ Main bundle (${src}) is ${kb} KB, within the ${budgetKb} KB budget.`)
}

main()
