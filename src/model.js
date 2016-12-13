import Immutable from 'immutable'

import { isDefined } from './util'
import { fieldFactory } from './field'

/**
 * A Model represents an RDF subgraph.  Specifically, it represents a number of
 * RDF quads all relating to the same subject.  It allows for convenient
 * querying and updating of RDF data in a functional and immutable manner.
 *
 * @typedef {Object} Model
 * @property {Object} subject - The subject of the model represented as an RDF
 * NamedNode.
 * @property {Immutable.Map<String, Field[]>} _fields - The fields of this model
 * keyed by the field keys, which are user-specified aliases for RDF predicates.
 * @property {Array[Object]} graveyard - An array of RDF quads which have been
 * removed from the model.
 */

/**
 * Generates a factory for creating models.
 *
 * @param {Object} rdf - An RDF library, currently assumed to be rdflib.js.
 * @param {Object} options.sourceConfig - A configuration object containing the
 * default listed and unlisted source graphs, and a mapping of all source graphs
 * to whether they're listed.
 * @param {Object} options.sourceConfig.defaultSources - An object with two
 * keys, 'listed', and 'unlisted', which each map to strings representing URIs
 * for the default listed and unlisted graphs, respectively.
 * @param {Object} options.sourceConfig.sourceIndex - An object whose keys are
 * string URIs and whose values are booleans indicating whether or not those
 * URIs are listed or unlisted.  true indicates listed, and false indicates
 * unlisted.
 * @param {Object} fieldMap - A mapping of predicate aliases to RDF predicate
 * nodes. For example: { 'name': '<http://xmlns.com/foaf/0.1/name>' }
 * @param {Object} fieldCreators - A mapping from field keys to field factory
 * functions.
 * @returns {Function} - A factory function for creating actual models.  The
 * factory takes two arguments - an RDF graph object to parse and the subject of
 * the model as a string.
 */
export function modelFactory (rdf, sourceConfig, fieldMap) {
  const factory = fieldFactory(sourceConfig)
  return (graph, subjectStr) => {
    const fieldCreators = {}
    const subject = rdf.NamedNode.fromValue(subjectStr)
    const fields = Immutable.Map(
      Object.keys(fieldMap).reduce((prevFields, fieldName) => {
        const fieldPredicate = fieldMap[fieldName]
        const matchingQuads = graph
          .statementsMatching(subject, fieldPredicate)
        const fieldCreator = factory(fieldPredicate)
        fieldCreators[fieldName] = fieldCreator
        const matchingFields = matchingQuads.map(
          quad => fieldCreator.fromQuad(quad)
        )
        return {...prevFields, ...{[fieldName]: matchingFields}}
      }, {})
    )
    // By definition, all the predicates in `fieldMap` must be unique, hence
    // inverting the map to have a (predicate -> fieldKey) mapping is safe.
    const reverseFieldMap = Object.keys(fieldMap).reduce(
      (rdxn, fieldKey) => { return {...rdxn, [fieldMap[fieldKey]]: fieldKey} }, {}
    )
    return new Model(subject, fields, [], fieldCreators, reverseFieldMap)
  }
}

export class Model {
  /**
   * Creates a model.  Requires subject, fields, and optional graveyard.
   *
   * @constructor
   * @param {Object} subject - The subject of this model as an RDF subject
   * object.
   * @param {Immutable.Map.<String, Field>} fields - a map of field keys to
   * field objects.  Field keys are aliases for a particular RDF predicate.
   * @param {Field[]=} graveyard - An optional array of fields which have been
   * removed from the model.
   * @returns {Model} the newly constructed model.
   */
  constructor (subject, fields, graveyard = [], fieldCreators = {}, reverseFieldMap = {}) {
    this.subject = subject
    this._fields = fields
    this.fieldCreators = fieldCreators
    this.reverseFieldMap = reverseFieldMap
    this.graveyard = graveyard
    Object.freeze(this)
  }

  fromCurrentState ({
    fields = this._fields,
    graveyard = this.graveyard,
    fieldCreators = this.fieldCreators,
    reverseFieldMap = this.reverseFieldMap
  }) {
    return new Model(this.subject, fields, graveyard, fieldCreators, reverseFieldMap)
  }

  /**
   * Get all the fields for a given key.
   *
   * @param {String} key - the key of the fields to look up.
   * @returns {Field[]} An array of fields for the given key.
   */
  fields (key) {
    return this._fields.get(key) || []
  }

  /**
   * Get all the field values for a given key.
   *
   * @param {String} key - the key of the fields to look up.
   * @returns {String[]} An array of field values for the given key.
   */
  get (key) {
    return this.fields(key).map(field => field.value)
  }

  /**
   * Get one of the field values for a given key.  This just looks for the first
   * field value, but order isn't guaranteed.
   *
   * @param {String} key - the key of the field to look up.
   * @returns {String|undefined} The field value for the given key, or undefined
   * if none was found.
   */
  any (key) {
    return this.fields(key).map(field => field.value)[0]
  }

  /**
   * Creates a model with an extra field.
   *
   * @param {String} key - the key of the fields to add to.
   * @param fieldValue - the value of the field to add.
   * @returns {Model} - the updated model.
   */
  add (key, fieldValue, fieldOptions) {
    return this.fromCurrentState({
      fields: this._fields.set(key, [
        ...this._fields.get(key),
        this.fieldCreators[key](fieldValue, fieldOptions)
      ])
    })
  }

  /**
   * Adds a field from an RDF quad.
   *
   * @param {Object} quad - the RDF quad to be converted to a field and added to
   * this model.
   * @returns {Model} - the updated model.
   */
  addQuad (quad) {
    const key = this.reverseFieldMap[quad.predicate]
    return this.fromCurrentState({
      fields: this._fields.set(key, [
        ...this._fields.get(key),
        this.fieldCreators[key].fromQuad(quad)
      ])
    })
  }

  /**
   * Creates a model with a removed field.
   *
   * @param {Field} field - the field to remove.
   * @returns {Model} - the updated model.
   */
  remove (field) {
    if (!this.find(f => f.id === field.id)) {
      return this
    }
    return this.filterToGraveyard(f => f.id !== field.id)
  }

  /**
   * Creates a model with a modified field.
   *
   * @param {Field} oldField - the field which should be removed.
   * @param newFieldValue - the new field's value.
   * @param {Object} newFieldOptions - arguments to create the new field.
   * @param {Boolean} newFieldOptions.listed - the new field's listed value.
   * @param {Boolean} newFieldOptions.namedNode - whether the new field is a
   * named node or not.
   * @returns {Model} - the updated model.
   */
  set (oldField, newFieldValue, newFieldOptions) {
    return this.map(field => {
      return field.id === oldField.id
        ? field.set({...newFieldOptions, value: newFieldValue})
        : field
    })
  }

  /**
   * Creates a model with a modified field chosen by key.  This method should
   * only be called with keys for which only one field exists, as there are no
   * guarantees for how it picks a field.  A new field for the specified key if
   * no existing field is found.
   *
   * @param {String} key - the key of a field to replace.
   * @param fieldValue - the new field value.
   * @param {Object} FieldOptions - arguments to create the new field.
   * @param {Boolean} FieldOptions.listed - the new field's listed value.
   * @param {Boolean} FieldOptions.namedNode - whether the new field is a named
   * node or not.
   * @returns {Model} - the updated model.
   */
  setAny (key, fieldValue, fieldOptions) {
    const firstField = this.fields(key)[0]
    return firstField
      ? this.set(firstField, fieldValue, fieldOptions)
      : this.add(key, fieldValue, fieldOptions)
  }

  /**
   * Compare the current state of the model with its original state and
   * determine, for each RDF named graph in the model, which fields should be
   * removed and which should be inserted.
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
  diff (rdf) {
    const diffMap = this._fields
      .toArray()
      .reduce((reduction, cur) => [...reduction, ...cur])
      .reduce((previousMap, field) => {
        const map = Object.assign({}, previousMap)
        const newQuad = field.toQuad(rdf, this.subject)
        const newSourceURI = newQuad.graph.value
        const originalQuad = field.originalQuad(rdf, this.subject)
        const originalSourceURI = originalQuad
          ? originalQuad.graph.value
          : null
        const fieldHasChanged = (
          !originalQuad || !newQuad.equals(originalQuad)
        )
        if (fieldHasChanged) {
          if (originalQuad) {
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

    this.graveyard.forEach((field) => {
      const quad = field.originalQuad(rdf, this.subject)
      if (quad) {
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
   * Save model updates using an LDP web client.
   *
   * @param {Object} rdf - An RDF library, currently assumed to be rdflib.js.
   * @param {Object} web - A web client library, currently assumed to be
   * solid-web-client.
   * @param {Model} model - The model to save.
   * @returns {Promise<Model>} The updated model.
   */
  save (rdf, web) {
    const diffMap = this.diff(rdf)
    const urisToPatch = Object.keys(diffMap)
    if (urisToPatch.length === 0) {
      return Promise.resolve(this)
    }
    return patchURIs(rdf, web, diffMap)
      .then(patchedURIs => {
        const updatedModel = this.map(
          field => patchedURIs.has(field.getCurrentSource(rdf).value)
            ? field.fromCurrentState(rdf, this.subject)
            : field
        ).clearGraveyard()
        const allPatchesSucceded = patchedURIs.size === urisToPatch.length
        if (allPatchesSucceded) {
          return updatedModel
        } else {
          const err = new Error('Not all patches succeeded')
          err.model = updatedModel
          err.diffMap = diffMap
          err.failedURIs = new Set(urisToPatch.filter(uri => !patchedURIs.has(uri)))
          throw err
        }
      })
  }

  /**
   * Maps a function onto every field, and returns a new model with the
   * corresponding fields.
   *
   * @param {Function(Field)} fn - A function to apply to every field in the
   * model.  The function receives one argument - the current field.
   * @param {Model} model - the model being mapped over.
   * @returns {Model} A new model containing the result of the field mapping.
   */
  map (fn) {
    return this.fromCurrentState({
      fields: this._fields.map(fieldsArray => fieldsArray.map(fn))
    })
  }

  /**
   * Locate and return the first field on a model that satisfies a predicate
   * function.
   *
   * @param {Function(Field)} - the predicate function which takes each field on
   * the model as an argument.
   * @returns {Field} - The identified field.
   */
  find (fn) {
    return this._fields
      .reduce((fields, curFieldsArray) => [...fields, ...curFieldsArray])
      .find(field => fn(field))
  }

  /**
   * Filter fields and mov them to the graveyard if they don't pass a predicate
   * function.
   *
   * @param {Function(Field)} fn - A predicate function returning a Boolean to
   * apply to every field in the model.  Fields which pass the predicate stay in
   * the model, and those which fail the test are removed.
   * @returns {Model} A new model with some fields filtered into the graveyard.
   */
  filterToGraveyard (fn) {
    const removedFields = []
    const newFields = this._fields
      .map(fieldsArray => fieldsArray.filter(field => {
        const testPassed = fn(field)
        if (!testPassed) {
          removedFields.push(field)
        }
        return testPassed
      }))
    return this.fromCurrentState({
      fields: newFields,
      graveyard: [...this.graveyard, ...removedFields]
    })
  }

  /**
   * Returns a new model with the same fields but an empty graveyard.
   *
   * @returns {Model} - The new graveyard-less model
   */
  clearGraveyard () {
    return this.fromCurrentState({graveyard: []})
  }
}

/**
 * Given a diff map (from Model.diff), patch each resource in the diff map using
 * the web client's patch method.  Return a Promise which resolves to the set of
 * URIs which were successfully patched.  Note that the Promise does not reject;
 * if some resources failed to be patched, they're not included in the URI set.
 *
 * @param {Object} rdf - An RDF library, currently assumed to be rdflib.js.
 * @param {Object} web - A web client library, currently assumed to be
 * @param {Object} diffMap - The result of running Model.diff() on a model.
 * @returns {Promise<Set<String>>} A Promise which always resolves to the set of
 * URIs for which the patches succeeded.
 */
function patchURIs (rdf, web, diffMap) {
  const urisToPatch = Object.keys(diffMap)
  return Promise.all(
    urisToPatch.map(uri => {
      return web
        .patch(uri, diffMap[uri].toDel, diffMap[uri].toIns)
        .then(solidResponse => ({URI: solidResponse.url, succeeded: true}))
        .catch(solidResponse => ({URI: solidResponse.url, succeeded: false}))
    }))
    .then(sourceResults => {
      return new Set(
        sourceResults
          .filter(result => result.succeeded)
          .map(result => result.URI)
      )
    })
}
