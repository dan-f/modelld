import Field from './field'

/**
 * A Model represents a subgraph of an RDF graph.
 *
 * Rather than instantiate a Model directly, call createModel().
 */
class Model {
  /**
   * Rather than instantiate a Model directly, call createModel().
   *
   * @constructor
   *
   * @param {Immutable.Map<String, Field>} fields - a map of field names to
   * field objects.  Field names are aliases for a particular RDF predicate.
   */
  constructor (fields) {
    this._fields = fields
  }

  /**
   * Change the value of a field.  Because Models are immutable, this method
   * will return a new Model with the corresponding new field value.
   *
   * @param {String} fieldName - the name of the field to update.
   * @param {String|Array<String>} fieldVal - the new value of the field.
   * Currently limited to strings or an array of strings.
   */
  // set (fieldName, fieldVal) {
  //   const field = this._fields.get(fieldName)
  //   return new Model(this._fields.set(fieldName, field.set(fieldVal)))
  // }

  /**
   * Get the value of a field.
   *
   * @param {String} fieldName - the name of the field to look up.
   */
  get (fieldName) {
    return this._fields.get(fieldName)
  }
}

export default Model
