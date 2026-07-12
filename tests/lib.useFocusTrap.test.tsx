// @vitest-environment jsdom
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useFocusTrap } from '../src/lib/useFocusTrap'

afterEach(() => cleanup())

function TestModal({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, true, onClose)
  return (
    <div ref={ref} role="dialog" tabIndex={-1}>
      <button type="button">First</button>
      <button type="button">Middle</button>
      <button type="button">Last</button>
    </div>
  )
}

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button autoFocus onClick={() => setOpen(true)} type="button">
        Open
      </button>
      {open ? <TestModal onClose={() => setOpen(false)} /> : null}
    </div>
  )
}

describe('useFocusTrap', () => {
  it('moves focus to the first focusable element inside the modal on open', () => {
    render(<TestModal onClose={() => undefined} />)
    expect(document.activeElement).toBe(screen.getByText('First'))
  })

  it('wraps Tab from the last element back to the first, and Shift+Tab from the first to the last', () => {
    render(<TestModal onClose={() => undefined} />)
    const last = screen.getByText('Last')
    const first = screen.getByText('First')

    last.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    first.focus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(<TestModal onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('restores focus to the element that opened the modal, once it closes', () => {
    render(<Harness />)
    const openButton = screen.getByText('Open')
    openButton.focus()
    expect(document.activeElement).toBe(openButton)

    fireEvent.click(openButton)
    expect(document.activeElement).toBe(screen.getByText('First'))

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.activeElement).toBe(openButton)
  })
})
