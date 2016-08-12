import clone from 'lodash/clone'
import uuid from 'node-uuid'

import { isDefined } from './util'

/**
 * A Field represents, for an implicit subject, a predicate, a value, and
 * whether or not the field is public (listed).
 *
 * @typedef {Object} Field
 * @property {Object=} _quad - The RDF quad object which the field may have been
 * constructed from.  A field either has a quad or a predicate.
 * @property {Object=} _predicate- The RDF predicate which this field
 * represents.  A field either has a quad or a predicate.
 * @property {String} _id - A UUID.
 * @property {String} value - The value of this field.  Currently only strings
 * are supported.
 * @property {Boolean} listed - Whether or not this field is listed (public) or
 * unlisted (private).
 */

/**
 * Generates a factory for creating fields.
 *
 * @param {Object} sourceConfig - A configuration object containing the default
 * listed and unlisted source graphs, and a mapping of all source graphs to
 * whether they're listed.
 * @param {Object} sourceConfig.defaultSources - An object with two keys,
 * 'listed', and 'unlisted', which each map to strings representing URIs for the
 * default listed and unlisted graphs, respectively.
 * @param {Object} sourceConfig.sourceIndex - An object whose keys are string
 * URIs and whose values are booleans indicating whether or not those URIs are
 * listed or unlisted.  true indicates listed, and false indicates unlisted.
 * @returns {Function} A factory function of one argument, an RDF predicate,
 * which in turn returns a fully configured field object.  The return function
 * also has a `fromQuad` method, which can construct a fully configured field
 * from an RDF quad object.
 */
export function fieldFactory (sourceConfig) {
  return (predicate) => {
    const fieldCreator = (value, options = {}) => {
      return createField({
        predicate,
        value,
        listed: options.listed,
        sourceConfig
      })
    }
    fieldCreator.fromQuad = quad => {
      return createField({quad, sourceConfig})
    }
    fieldCreator.predicate = predicate
    return fieldCreator
  }
}

/**
 * Fields are constructed with a predicate, value, and listed status which can
 * either be specified via an RDF quad, or ad hoc values.
 *
 * @param {Object} options - An options object specifying named parameters.
 * @param {Object=} options.quad - The original RDF quad which this field
 * represents.  This quad is the original value of the field.  Must either
 * provide a quad or a predicate.
 * @param {Object=} options.predicate - The RDF predicate which this field
 * represents.  Must either provide a quad or a predicate.
 * @param {String} options.value - Optionally specifies the current value of
 * this field.  Should only be provided by the field class internally when
 * updating a field.
 * @param {Boolean} options.listed - Whether or not this field is listed
 * (public) or unlisted (private).
 * @param {Object} options.sourceConfig - A configuration object containing
 * the default listed and unlisted source graphs, and a mapping of all source
 * graphs to whether they're listed.
 * @param {Object} options.sourceConfig.defaultSources - An object with two
 * keys, 'listed', and 'unlisted', which each map to strings representing URIs
 * for the default listed and unlisted graphs, respectively.
 * @param {Object} options.sourceConfig.sourceIndex - An object whose keys are
 * string URIs and whose values are booleans indicating whether or not those
 * URIs are listed or unlisted.  true indicates listed, and false indicates
 * unlisted.
 * @returns {Object} the newly constructed field object.
 */
function createField ({ quad, predicate, value, listed, sourceConfig }) {
  const field = {}
  if (isDefined(quad) && isDefined(predicate)) {
    throw new Error('Must provide either quad or predicate, but not both.')
  }
  if (isDefined(quad)) {
    const { sourceIndex } = sourceConfig
    field._quad = quad
    field.value = quad.object.value
    field.listed = isDefined(quad.graph)
      ? sourceIndex[quad.graph.value]
      : false
  }
  if (isDefined(predicate)) {
    field._predicate = predicate
  }
  if (isDefined(value)) {
    field.value = value
  }
  if (isDefined(listed)) {
    field.listed = listed
  } else {
    // If we haven't already set a listed value, default to true.
    field.listed = isDefined(field.listed)
      ? field.listed
      : false
  }
  field._sourceConfig = sourceConfig
  field._id = uuid.v4()
  return new Proxy(field, {
    set: () => {
      throw new Error('Fields are immutable.  Use Field.set() to create new fields with different values.')
    }
  })
}

/**
 * Generates an RDF quad representing the current state of the field.
 *
 * @param {Object} rdf - An RDF library, currently assumed to be rdflib.js
 * @param {Object} subject - The implicit subject for this field.  Particularly,
 * an RDF subject, currently assumed to be an rdflib.js subject.
 * @param {Field} field - the field to convert to an RDF quad.
 * @returns {Object} An RDF quad representing the current state of this field.
 */
export function toQuad (rdf, subject, field) {
  const { defaultSources, sourceIndex } = field._sourceConfig
  let sourceURI
  if (isDefined(field._quad)
      && field.listed === sourceIndex[field._quad.graph.value]) {
    sourceURI = field._quad.graph.value
  } else {
    sourceURI = field.listed ? defaultSources.listed : defaultSources.unlisted
  }
  let object
  if (isDefined(field._quad)) {
    object = clone(field._quad.object)
    object.value = field.value
  } else {
    object = rdf.Literal.fromValue(field.value)
  }
  return rdf.quad(
    subject,
    isDefined(field._quad) ? field._quad.predicate : field._predicate,
    object,
    rdf.namedNode(sourceURI)
  )
}

/**
 * Creates a field with the opposite listed value as the provided field.
 *
 * @returns {Field} a new field with the opposite listed value as the
 * provided field.
 */
export function toggleListed (field) {
  return set(field, {listed: !field.listed})
}

/**
 * Returns a field with the specified state.
 *
 * @param {Object} options - An options object specifying named parameters.
 * @param {String} options.value - The new field value.
 * @param {Boolean} options.listed - The new listed value.
 * @returns {Field} A field with the specified state.
 */
export function set (field, { value = null, listed = null }) {
  return createField({
    quad: field._quad,
    predicate: field._predicate,
    value: value !== null ? value : field.value,
    listed: listed !== null ? listed : field.listed,
    sourceConfig: field._sourceConfig
  })
}
