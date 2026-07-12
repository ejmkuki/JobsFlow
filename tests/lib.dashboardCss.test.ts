import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// A live-browser mobile-viewport check wasn't reachable in this environment
// (local wrangler pages dev couldn't inject secrets into the Functions
// runtime — unrelated to app code), so this guards the specific bugs found
// by direct CSS audit: a flex child with overflow-x:auto but no min-width:0
// never actually shrinks/scrolls inside a flex row (min-width defaults to
// auto), and an unwrapped flex row of several buttons/inputs overflows the
// viewport instead of wrapping to a second line.
const css = readFileSync(join(process.cwd(), 'src/features/dashboard/dashboard.css'), 'utf8')

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
  if (!match) throw new Error(`No CSS rule found for ${selector}`)
  return match[1]
}

describe('dashboard.css mobile-safe flex containers', () => {
  it('.jf-tabs can actually shrink and scroll inside the nav row (min-width: 0 alongside overflow-x)', () => {
    const body = ruleBody('.jf-tabs')
    expect(body).toContain('min-width: 0')
    expect(body).toContain('overflow-x: auto')
  })

  it('.jf-item-actions wraps instead of overflowing when it holds several buttons/inputs (apply row, share panel, notes)', () => {
    expect(ruleBody('.jf-item-actions')).toContain('flex-wrap: wrap')
  })

  it('.jf-head-actions wraps instead of overflowing (job picker + blind-review toggle + new-role button)', () => {
    expect(ruleBody('.jf-head-actions')).toContain('flex-wrap: wrap')
  })

  it('.jf-board-wrap scrolls the kanban board horizontally rather than squeezing columns', () => {
    expect(ruleBody('.jf-board-wrap')).toContain('overflow-x: auto')
  })
})
