/**
 * Apply function `fn` to object or array `maybeArray`.
 */
export function callOrMap(fn, maybeArray) {
  return (Array.isArray(maybeArray))
    ? maybeArray.map(fn)
    : fn(maybeArray)
}
