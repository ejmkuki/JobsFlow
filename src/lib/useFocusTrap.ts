import { useEffect, useRef, type RefObject } from 'react'

const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

// Real focus management for a custom modal, not just an aria-modal attribute:
// moves focus into the dialog on open, traps Tab/Shift+Tab inside it so a
// keyboard or screen-reader user can never tab out to the page behind, closes
// on Escape, and restores focus to whatever triggered the modal on close —
// the four things a native <dialog> gives you for free that a plain <div>
// with role="dialog" does not.
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean, onClose: () => void) {
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return

    previouslyFocused.current = document.activeElement as HTMLElement | null
    const container = containerRef.current
    const initial = container?.querySelector<HTMLElement>(focusableSelector)
    ;(initial ?? container)?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const node = containerRef.current
      if (!node) return
      const focusables = Array.from(node.querySelectorAll<HTMLElement>(focusableSelector))
      if (focusables.length === 0) return

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      previouslyFocused.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}
