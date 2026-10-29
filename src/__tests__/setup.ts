import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
})

// jsdom não tem scrollTo
if (!window.scrollTo) window.scrollTo = (() => undefined) as any
window.scrollTo = (() => undefined) as any
