import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Guards the mobile CSS bugs found this phase — first by direct code audit,
// then live-verified at 375px with real seeded data via a local wrangler
// pages dev session (getBoundingClientRect()/scrollWidth checks in the
// browser, not screenshots). That live pass caught a second-order bug the
// first fix introduced: .jf-tabs's min-width:0 stopped the *page* from
// overflowing, but did it by letting the flex row squeeze tabs all the way
// to a genuine 0px rendered width once nav-right (mode switch + notif +
// account) claimed its own preferred size — tabs were in the DOM and
// clickable, but completely invisible. Hiding the mode switch at <=480px
// (the single biggest nav-right item, and the most skippable at that width)
// gave tabs real width back; re-verified live afterward.
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

  it('hides the nav mode switch at <=480px so .jf-tabs keeps real width instead of being squeezed to 0', () => {
    const match = css.match(/@media \(max-width: 480px\)\s*\{([^}]*\.jf-mode[^}]*)\}/)
    expect(match).toBeTruthy()
    expect(match?.[1]).toContain('display: none')
  })
})
