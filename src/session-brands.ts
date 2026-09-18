/**
 * Local admission for the Session log-offset brand (runtime twin of the
 * `SessionLogOffset` function in `@deepseek-ai/dsh-session`, whose durable
 * boundary re-validates): non-negative safe integer in, brand out. Kept local
 * so the plugin carries no bare runtime imports; the branded type is a local
 * alias, which is safe here because the receiving boundary validates the
 * number again.
 * @module dsh-worktree-jump/session-brands
 */

declare const BRAND: unique symbol

/** A Session log gap, prefix length, or read offset, which may equal the event count. */
export type SessionLogOffset = number & { readonly [BRAND]: 'SessionLogOffset' }

/**
 * Admit a numeric value as a Session log offset.
 * @param value - non-negative safe integer used as a gap or prefix length.
 * @returns the same number with the Session-log-offset brand.
 * @throws {TypeError} when the value is not a non-negative safe integer.
 */
export function SessionLogOffset(value: number): SessionLogOffset {
  if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
    throw new TypeError(`SessionLogOffset must be a non-negative safe integer, got ${String(value)}`)
  }
  return value as SessionLogOffset
}
