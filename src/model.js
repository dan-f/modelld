import Immutable from 'immutable'

import * as Field from './field'
import { isDefined } from './util'

/**
 * A Model represents an RDF subgraph.  Specifically, it represents a number of
 * RDF quads all relating to the same subject.  It allows for convenient
 * querying and updating of RDF data in a functional and immutable manner.
 *
 * @typedef {Object} Model
 * @property {Object} subject - The subject of the model represented as an RDF
 * NamedNode.
 * @property {Immutable.Map<String, Field[]>} fields - The fields of this model
 * keyed by the field keys, which are user-specified aliases for RDF predicates.
 * @property {Array[Object]} graveyard - An array of RDF quads which have been
 * removed from the model.
 */

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
        const matchingFields = matchingQuads.map(
          quad => fieldCreator.fromQuad(quad)
        )
        return Object.assign(prevFields, {[fieldName]: matchingFields})
      }, {})
    )
    return createModel(subject, fields)
  }
}

/**
 * Creates a model.  Requires subject, fields, and optional graveyard.
 *
 * @param {Object} subject - The subject of this model as an RDF subject object.
 * @param {Immutable.Map.<String, Field>} fields - a map of field keys to field
 * objects.  Field keys are aliases for a particular RDF predicate.
 * @param {Field[]=} graveyard - An optional array of fields which have been
 * removed from the model.
 * @returns {Model} the newly constructed model.
 */
function createModel (subject, fields, graveyard = []) {
  const model = {
    subject,
    fields,
    graveyard
  }
  return new Proxy(model, {
    set: () => {
      throw new Error('Models are immutable.  Use Model.add(), Model.remove(),' +
                      ' or Model.set() to create new models with different' +
                      ' values.')
    }
  })
}

/**
 * Get all the fields on a model for a given key.
 *
 * @param {Model} model - the model.
 * @param {String} key - the key of the fields to look up.
 * @returns {Field[]} An array of fields for the given key.
 */
export function get (model, key) {
  return model.fields.get(key) || []
}

/**
 * Creates a model with an extra field.
 *
 * @param {Model} the model.
 * @param {String} key - the key of the fields to add to.
 * @param {Field} field - the field to add.
 * @returns {Model} - the updated model.
 */
export function add (model, key, field) {
  return createModel(
    model.subject,
    model.fields.set(key, [...model.fields.get(key), field])
  )
}

/**
 * Remove a field from a model.
 *
 * @param {Model} model - the model.
 * @param {String} key - the key of the fields to remove from.
 * @param {Field} field - the field to remove.
 * @returns {Model} - the updated model.
 */
export function remove (model, key, field) {
  if (get(model, key).filter(f => f.id === field.id).length === 0) {
    return model
  }
  return createModel(
    model.subject,
    model.fields.set(
      key,
      model.fields.get(key).filter(f => field.id !== f.id)
    ),
    [...model.graveyard, field]
  )
}

/**
 * Replace a field on a model.
 *
 * @param {Model} model - the model.
 * @param {String} key - the field key used to find the key to remove.
 * @param {Field} oldField - the field which should be removed.
 * @param {Object} newFieldArgs - arguments to create the new field.
 * @param {String} newFieldArgs.value - the new field's value.
 * @param {Boolean} newFieldArgs.listed - the new field's listed value.
 * @returns {Model} - the updated model.
 */
export function set (model, key, oldField, newFieldArgs) {
  return createModel(
    model.subject,
    model.fields.set(
      key,
      model.fields.get(key).map(f => {
        return f.id === oldField.id ? Field.set(f, newFieldArgs) : f
      })
    )
  )
}

/**
 * Compare the current state of the model with its original state and determine,
 * for each RDF named graph in the model, which fields should be removed and
 * which should be inserted.
 *
 * @param {Object} rdf - An RDF library, currently assumed to be rdflib.js.
 * @param {Model} model - the model.
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
export function diff (rdf, model) {
  const diffMap = model.fields
    .toArray()
    .reduce((reduction, cur) => [...reduction, ...cur])
    .reduce((previousMap, field) => {
      const map = Object.assign({}, previousMap)
      const newQuad = Field.toQuad(rdf, model.subject, field)
      const newSourceURI = newQuad.graph.value
      const originalQuad = field.quad
      const originalSourceURI = isDefined(originalQuad)
        ? originalQuad.graph.value
        : null
      const fieldHasChanged = (
        !isDefined(originalQuad) || !newQuad.equals(originalQuad)
      )
      if (fieldHasChanged) {
        if (isDefined(originalQuad)) {
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

  model.graveyard.forEach((field) => {
    const quad = field.quad
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

/**
 * TODO: document
 */
export function save (rdf, web, model) {
  const diffMap = diff(rdf, model)
  if (Object.keys(diffMap).length === 0) {
    return Promise.resolve(model)
  }
  const webClient = web(rdf)
  return Promise.all(
    Object.keys(diffMap).map(uri => {
      return webClient.patch(uri, diffMap[uri].toDel, diffMap[uri].toIns)
    })
  ).then(solidResponses => {
    return createModel(
      model.subject,
      model.fields
        .map(fieldsArray => {
          return fieldsArray.map(field => Field.fromCurrentState(rdf, model.subject, field))
        })
    )
  }).catch(err => {
    // TODO: stil refresh the model and return it
    console.log(err)
  })
}

// TODO: implement
export function refresh (web, model) {
  throw new Error('not yet implemented')
}

// I think the problem here is that the `values` array is going to return some
// sort of wrapped XHR response (check w/ Dmitri).  What I want to do is to
// return the model which represents the current state of the server post-save.
// We can't just return the old model because the cached original RDF quads may
// have been deleted from the server(s).  I think that we'll have to iterate
// over all the field URIs and refresh them, and then recreate the model from
// those responses.  We could also consider it out of scope since this library
// doesn't know how the original data for the model was initially fetched.
//
// TODO: document assumptions
