import Immutable from 'immutable'

import * as Field from './field'
import { isDefined } from './util'

/**
 * Generates a factory for creating models.
 *
 * @param {Object} rdf - An RDF library, currently assumed to be rdflib.js.
 * @param {Object} fieldCreators - A mapping from field keys to field factory
 * functions.
 * @returns {Function} - A factory function for creating actual models.  The
 * factory takes two arguments - an RDF graph object to parse and the subject of
 * the model as a string.
 */
export function modelFactory (rdf, fieldCreators) {
  return (graph, subjectStr) => {
    const subject = rdf.namedNode(subjectStr)
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
   * Rather than instantiate a Model directly, use the model factory.
   *
   * @constructor
   *
   * @param {Object} subject - The subject of this model as an RDF subject
   * object.
   * @param {Immutable.Map.<String, Field>} fields - a map of field keys to field
   * objects.  Field keys are aliases for a particular RDF predicate.
   * @param {Field[]=} graveyard - An optional array of fields which have been
   * removed from the model.
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
   * @param {String} key - the field key used to find the key to remove.
   * @param {Field} oldField - the field which should be removed.
   * @param {Object} newFieldArgs - arguments to create the new field.
   * @param {String} newFieldArgs.value - the new field's value.
   * @param {Boolean} newFieldArgs.listed - the new field's listed value.
   * @returns {Model} - the updated model.
   */
  set (key, oldField, newFieldArgs) {
    return new Model(
      this._subject,
      this._fields.set(
        key,
        this._fields.get(key).map(f => {
          return f._id === oldField._id ? Field.set(f, newFieldArgs) : f
        })
      )
    )
  }

  /**
   * Compare the current state of the model with its original state and
   * determine, for each RDF graph in this model, which fields should be removed
   * and which should be inserted.
   *
   * @param {Object} rdf - An RDF library, currently assumed to be rdflib.js.
   * @returns {Object} A mapping from graph URIs to the RDF quads (as strings)
   * which should be inserted and deleted within those URIs.  For example:
   *   {
   *     'http://example.com/one-resource': {
   *       toIns: [ Field1 ],
   *       toDel: [ ],
   *     },
   *     'http://example.com/another-resource': {
   *       toIns: [ ],
   *       toDel: [ Field2 ],
   *     },
   *   }
   */
  _diff (rdf) {
    const diffMap = this._fields
      .toArray()
      .reduce((reduction, cur) => [...reduction, ...cur])
      .reduce((previousMap, field) => {
        const map = Object.assign({}, previousMap)
        const newQuad = Field.toQuad(rdf, this._subject, field)
        const newSourceURI = newQuad.graph.value
        const originalQuad = field._quad
        const originalSourceURI = isDefined(field._quad)
          ? field._quad.graph.value
          : null
        const fieldHasChanged = !isDefined(originalQuad) || !newQuad.equals(originalQuad)
        if (fieldHasChanged) {
          if (originalSourceURI) {
            if (!isDefined(map[originalSourceURI])) {
              map[originalSourceURI] = {toDel: [], toIns: []}
            }
            map[originalSourceURI].toDel.push(originalQuad.toString())
          }
          if (!isDefined(map[newSourceURI])) {
            map[newSourceURI] = {toDel: [], toIns: []}
          }
          map[newSourceURI].toIns.push(newQuad.toString())
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
        diffMap[uri].toDel.push(quad.toString())
      }
    }, diffMap)

    return diffMap
  }

  save (rdf, webClient) {
     return this._diff(rdf)
  }
}
