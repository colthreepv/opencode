/**
 * Opens a Kobalte `ContextMenu` from the keyboard. Kobalte only listens for `contextmenu`, which not every platform
 * fires for Shift+F10 or the ContextMenu key, and keyboard-fired ones carry no useful position. Anchor the menu at the
 * row's start, just below it.
 */
export function openContextMenuFromKeyboard(event: KeyboardEvent & { currentTarget: HTMLElement }) {
  if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return
  event.preventDefault()
  const rect = event.currentTarget.getBoundingClientRect()
  const rtl = getComputedStyle(event.currentTarget).direction === "rtl"

  event.currentTarget.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: rtl ? rect.right - 8 : rect.left + 8,
      clientY: rect.bottom,
    }),
  )
}
