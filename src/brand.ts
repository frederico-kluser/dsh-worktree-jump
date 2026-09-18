/**
 * Local duplicate of the compile-time brand primitives (`@deepseek-ai/dsh-brand`
 * semantics, `packages/util/brand` is the source of truth): a brand makes
 * structurally identical strings non-interchangeable at the type level while
 * comparison and serialization keep the underlying primitive. The package
 * carries no runtime identity, so a local copy is interchangeable with the
 * installed one — and keeps this plugin free of bare runtime imports, since
 * it loads from an arbitrary filesystem location with no node_modules.
 * @module dsh-worktree-jump/brand
 */

declare const BRAND: unique symbol

/** A string carrying a compile-time-only brand `B` (local mirror). */
export type Branded<B extends string> = string & { readonly [BRAND]: B }

/**
 * Apply a compile-time string brand without changing the value. The
 * constraint is a plain string (not the local `Branded`): brands from other
 * declaration sites (the installed `@deepseek-ai/dsh-brand`) are structurally
 * distinct types, and this helper only re-labels admitted values.
 * @param value - string admitted by the domain that owns the target brand.
 * @returns the same string with the requested compile-time brand.
 */
export function brandString<T extends string>(value: string | T): T {
  return value as T
}
