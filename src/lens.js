import Field from './field'

/**
 * TODO: Description of what a lens is.
 *
 * TODO: example use of a lens
 */
class Lens {
  /**
   * TODO: Description of how to instantiate a lens.
   *
   * TODO: example of instantiating a lens
   *
   * TODO: JSDoc arguments
   */
  constructor (fields) {
    this._fields = fields
  }

  set (fieldName, fieldVal) {
    const curField = this._fields.get(fieldName)
    const newField = Array.isArray(fieldVal)
      ? fieldVal.map(val => curField.set(val))
      : curField.set(fieldVal)

    // Actually return a new instance
    return new Lens(this._fields.set(fieldName, newField))
  }

  field (fieldName) {
    return this._fields.get(fieldName)
  }

  get (fieldName) {
    return Array.isArray(this.field(fieldName))
      ? this.field(fieldName).map(field => field.val)
      : this.field(fieldName).val
  }
}

export default Lens
