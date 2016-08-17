/**
 * Determines whether a value is not `undefined`.
 *
 * @param {*} value - the value to test.
 * @returns {Boolean} - true if the value is defined, false otherwise.
 */
export function isDefined (value) {
  return typeof value !== 'undefined'
}
