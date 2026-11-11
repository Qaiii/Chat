/**
 * Host half of dsh-chat.
 *
 * The plugin is entirely a browser-side surface: a left-sidebar Chat panel that
 * hosts an Electron webview. The Host needs this no-op entry only because an
 * external client plugin is loaded as a bundle row (see cordis.patch.yml).
 *
 * @module dsh-chat/index
 */

/** Package name; the bundle row id in cordis.patch.yml is `dsh-chat` too. */
export const name = 'dsh-chat'

/** Host plugin body: the Chat panel contributes nothing to the Host tree. */
export function apply() {}
