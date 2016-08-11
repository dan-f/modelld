import Immutable from 'immutable'

import { Field } from './field'
import { isDefined } from './util'

export function modelFactory (rdf, fieldCreators) {
  // TODO: determine if `subject` should be an RDF data type... i want it to
  // just be a string
  return (graph, subject) => {
    const fields = Immutable.Map(
      Object.keys(fieldCreators).reduce((prevFields, fieldName) => {
        const fieldCreator = fieldCreators[fieldName]
        const matchingQuads = graph
          .statementsMatching(subject, fieldCreator.predicate)
        const matchingFields = matchingQuads.map(quad => fieldCreator.fromQuad(quad))
        return Object.assign(prevFields, {[fieldName]: matchingFields})
      }, {})
    )
    return new Model(subject, fields)
  }
}

/**
 * A Model represents a subgraph of an RDF graph.
 *
 * Rather than instantiate a Model directly, call modelFactory().
 */
export class Model {
  /**
   * Rather than instantiate a Model directly, call modelFactory().
   *
   * @constructor
   *
   * TODO: document subject and graveyard param
   * @param {Immutable.Map<String, Field>} fields - a map of field keys to field
   * objects.  Field keys are aliases for a particular RDF predicate.
   */
  constructor (subject, fields, graveyard = []) {
    this._subject = subject
    this._fields = fields
    this._graveyard = graveyard
  }

  /**
   * Get all the fields for a given key.
   *
   * @param {String} key - the key of the fields to look up.
   * @returns {Field[]} An array of fields for the given key.
   */
  get (key) {
    return this._fields.get(key) || []
  }

  /**
   * Add a field to the model.
   *
   * @param {String} key - the key of the fields to add to.
   * @param {Field} field - the field to add.
   * @returns {Model} - the updated model.
   */
  add (key, field) {
    return new Model(
      this._subject,
      this._fields.set(key, [...this._fields.get(key), field])
    )
  }

  /**
   * Remove a field from the model.
   *
   * @param {String} key - the key of the fields to remove from.
   * @param {Field} field - the field to remove.
   * @returns {Model} - the updated model.
   */
  remove (key, field) {
    const updatedModel = new Model(
      this._subject,
      this._fields.set(
        key,
        this._fields.get(key).filter(f => field._id !== f._id)
      ),
      [...this._graveyard, field]
    )
    return updatedModel
  }

  /**
   * Replace a field on the model.
   *
   * @param {String} key - the key of the fields to replace within.
   * @param TODO - update to `newFieldArgs`
   * @returns {Model} - the updated model.
   */
  set (key, oldField, newFieldArgs) {
    return new Model(
      this._subject,
      this._fields.set(
        key,
        this._fields.get(key).map(f => {
          return f._id === oldField._id ? f.set(newFieldArgs) : f
        })
      )
    )
  }

  // TODO: document
  _diff (rdf) {
    // TODO: refactor
    const diffMap = this._fields
      .toArray()
      .reduce((reduction, cur) => [...reduction, ...cur])
      .reduce((previousMap, field) => {
        const map = Object.assign({}, previousMap)
        const newQuad = field._toQuad(rdf, this._subject)
        const newSourceURI = newQuad.graph.value
        const originalQuad = field._quad
        const originalSourceURI = isDefined(field._quad)
          ? field._quad.graph.value
          : null
        if (!isDefined(originalQuad) || !newQuad.equals(originalQuad)) {
          if (originalSourceURI) {
            if (!isDefined(map[originalSourceURI])) {
              map[originalSourceURI] = {toDel: [], toIns: []}
            }
            map[originalSourceURI].toDel.push(originalQuad)
          }
          if (!isDefined(map[newSourceURI])) {
            map[newSourceURI] = {toDel: [], toIns: []}
          }
          map[newSourceURI].toIns.push(newQuad)
        }
        return map
      }, {})

    this._graveyard.forEach((field) => {
      const quad = field._quad
      if (isDefined(quad)) {
        const uri = quad.graph.uri
        if (!isDefined(diffMap[uri])) {
          diffMap[uri] = {toDel: [], toIns: []}
        }
        diffMap[uri].toDel.push(quad)
      }
    }, diffMap)

    return diffMap
  }

  save (rdf, webClient) {
     return this._diff(rdf)
  }
}
