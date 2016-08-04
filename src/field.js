import $rdf from 'rdflib'
import { callOrMap } from './util'

/**
 * A Field represents, for a particular subject, a predicate and the value(s)
 * that it points to.
 */
export default class Field {
  /**
   * Fields are constructed from a set (Array) of RDF statements.  They
   * take their initial value(s) from the set of values pointed to by the
   * provided RDF statements.
   *
   * @constructor
   *
   * @param {Array<RDF statement>} origStmts - The original set of RDF
   * statements which this field represents.  Even when the field value changes,
   * these statements should remain the same.
   * @param {String} curVal - Optionally specifies the current value(s) of this
   * field.  Should only be provided by the field class internally when updating
   * a field.
   */
  constructor (origStmts, curVal = null) {
    // cache the rdflib statement
    this._origStmts = origStmts
    this._val = (curVal != null)
      ? curVal
      : callOrMap(
        stmt => stmt.object.value != null ? stmt.object.value : stmt.object.uri,
        origStmts
      )
  }

  /**
   * Gets the current value of the field.
   */
  get val () {
    return this._val
  }

  /**
   * Exists to document the proper way to set a fields value.
   */
  set val (newVal) {
    throw new Error('Use .set() method to change a field\'s value')
  }

  /**
   * Changes the value of this field.  Because fields are immutable, this
   * returns a new Field object with the corresponding new value.
   *
   * @param {String|Array<String>} newFieldVal - the new value for this field.
   */
  set (newFieldVal) {
     return new Field(this._origStmts, newFieldVal)
  }

  // TODO: handle arrays
  _getStmt () {
    return callOrMap(
      val => $rdf.st(
        this._origStmt.subject,
        this._origStmt.predicate,
        $rdf.sym(this.val)
      ),
      this.val
    )
  }
}
