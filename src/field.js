import $rdf from 'rdflib'

/**
 * TODO: Description of what a field is.
 *
 * TODO: example use of a field
 */
export default class Field {
  /**
   * TODO: Description of how to instantiate a field.
   *
   * TODO: example of instantiating a field
   *
   * TODO: JSDoc arguments
   */
  constructor (origStmt, curVal = null) {
    // cache the rdflib statement
    this._origStmt = origStmt
    this._val = (curVal != null)
      ? curVal
      : origStmt.object.value != null
        ? origStmt.object.value
        : origStmt.object.uri
  }

  get val () {
    return this._val
  }

  set val (newVal) {
    throw new Error('Set field value via .set() method on the field')
  }

  // TODO: could this be more efficient?
  set (newFieldVal) {
     return new Field(this._origStmt, newFieldVal)
  }

  _getStmt () {
    return $rdf.st(
      this._origStmt.subject,
      this._origStmt.predicate,
      $rdf.sym(this.val)
    )
  }
}
