import * as React from "react"
import { useRouter } from "next/navigation"

/**
 * Warns before losing unsaved form changes.
 *
 * Covers two different kinds of navigation, which need two different
 * mechanisms:
 * - Hard navigation (refresh, close tab, type a new URL, external link) —
 *   the browser's own `beforeunload` confirm. Browsers ignore any custom
 *   text here and show their own generic wording; that's a browser
 *   restriction, not something this can style.
 * - Soft/in-app navigation (clicking a `<Link>` — sidebar nav, "Back to
 *   companies", another row) — App Router has no built-in navigation-block
 *   hook, so this intercepts anchor clicks in the capture phase before
 *   Next's own Link handler runs, and drives a caller-rendered confirm
 *   dialog instead of navigating immediately.
 *
 * Does not intercept the browser back/forward buttons (popstate) — doing
 * that reliably requires pushing synthetic history entries, which is its
 * own can of worms; out of scope unless it's actually needed.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const router = useRouter()
  const [pendingHref, setPendingHref] = React.useState<string | null>(null)
  const isDirtyRef = React.useRef(isDirty)
  isDirtyRef.current = isDirty

  React.useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!isDirtyRef.current) return
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [])

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!isDirtyRef.current) return
      // Respect modified clicks (open in new tab/window) and anything that
      // already opted out.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

      const anchor = (e.target as HTMLElement | null)?.closest("a")
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return

      const href = anchor.getAttribute("href")
      if (!href || href.startsWith("#")) return

      let url: URL
      try {
        url = new URL(href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      if (url.pathname + url.search === window.location.pathname + window.location.search) return

      e.preventDefault()
      setPendingHref(url.pathname + url.search + url.hash)
    }

    document.addEventListener("click", handleClick, true)
    return () => document.removeEventListener("click", handleClick, true)
  }, [])

  const confirmLeave = React.useCallback(() => {
    if (pendingHref) router.push(pendingHref)
    setPendingHref(null)
  }, [pendingHref, router])

  const cancelLeave = React.useCallback(() => {
    setPendingHref(null)
  }, [])

  return { promptOpen: pendingHref !== null, confirmLeave, cancelLeave }
}
