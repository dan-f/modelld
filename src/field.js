import clone from 'lodash/clone'
import uuid from 'node-uuid'

import { isDefined } from './util'

/**
 * A Field represents, for an implicit subject, a predicate, a value, and
 * whether or not the field is public (listed).
 *
 * @typedef {Object} Field
 * @property {Object=} quad - The RDF quad object which the field may have been
 * constructed from.  A field either has a quad or a predicate.
 * @property {Object=} predicate- The RDF predicate which the field represents.
 * A field either has a quad or a predicate.
 * @property {String} id - A UUID.
 * @property {String} value - The value of the field.  Currently only strings
 * are supported.
 * @property {Boolean} listed - Whether or not the field is listed (public) or
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
      return createField({
        predicate: quad.predicate,
        originalObject: quad.object,
        originalSource: quad.graph,
        sourceConfig
      })
    }
    fieldCreator.predicate = predicate
    return fieldCreator
  }
}

/**
 * Fields are constructed with a predicate, value, and listed status.  The value
 * and listed status can either be passed in as 'options.value' and
 * 'options.listed' or inferred through an RDF object node and an RDF graph
 * node.
 *
 * In order to fully specify a field, you *must* always pass in
 * 'options.predicate', 'options.sourceConfig', and one of the following three
 * options:
 * - `value` (and optionally `listed`) for an ad-hoc field
 * - `originalObject`, (and optionally `originalSource`, `value`, or `listed`)
 *   for a field tracking a quad which may have modified its value
 *
 * @param {Object} options - An options object specifying named parameters.
 * @param {Object=} options.originalObject - The original RDF object node that
 * the field represents if it is being constructed from an existing quad.
 * @param {Object=} options.originalSource - The original RDF graph node
 * representing the source of the field if it is being constructed from an
 * existing quad.
 * @param {Object=} options.predicate - The RDF predicate which the field
 * represents.  Must either provide a quad or a predicate.
 * @param {String=} options.value - Optionally specifies the current value of
 * the field.  Should only be provided by the field class internally when
 * updating a field.
 * @param {Boolean=} options.listed - Whether or not the field is listed
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
 * @returns {Object} the newly constructed field.
 */
function createField ({ predicate, value, listed, originalObject, originalSource, sourceConfig }) {
  if (!(isDefined(predicate) && isDefined(sourceConfig)) ||
      !(isDefined(value) || (isDefined(originalObject)))) {
    throw new Error('Insufficient arguments.')
  }
  const field = {
    predicate
  }
  // Set default 'value' and 'listed' values from the original RDF quad's object
  // and source properties.  This may be overridden by the current values of
  // 'value' and 'listed'.
  if (isDefined(originalObject)) {
    field.originalObject = originalObject
    field.value = originalObject.value
  }
  if (isDefined(originalSource)) {
    field.originalSource = originalSource
    field.listed = sourceConfig.sourceIndex[originalSource.value]
  }
  if (isDefined(value)) {
    field.value = value
  }
  if (isDefined(listed)) {
    field.listed = listed
  } else {
    // If we haven't already set a listed value, default to false.
    field.listed = isDefined(field.listed)
      ? field.listed
      : false
  }
  field._sourceConfig = sourceConfig
  field.id = uuid.v4()
  return Object.freeze(field)
}

/**
 * Gets the current source of a field.
 *
 * Handles edge cases in which a field may be repeatedly toggled
 * listed/unlisted.  Sometimes a field's source should not be the default
 * listed/unlisted source, but the one that the field originally came from.
 *
 * @param {Object} rdf - An RDF library, currently assumed to be rdflib.js
 * @param {Field} field - The field on which to locate the source.
 */
export function getCurrentSource (rdf, field) {
  const { defaultSources, sourceIndex } = field._sourceConfig
  let sourceURI
  if (isDefined(field.originalSource) &&
      field.listed === sourceIndex[field.originalSource.value]) {
    sourceURI = field.originalSource.value
  } else {
    sourceURI = field.listed ? defaultSources.listed : defaultSources.unlisted
  }
  return rdf.namedNode(sourceURI)
}

/**
 * Generates an RDF quad representing the current state of the field.
 *
 * @param {Object} rdf - An RDF library, currently assumed to be rdflib.js
 * @param {Object} subject - The implicit subject for the field.  Particularly,
 * an RDF subject, currently assumed to be an rdflib.js subject.
 * @param {Field} field - The field to convert to an RDF quad.
 * @returns {Object} An RDF quad representing the current state of the field.
 */
export function toQuad (rdf, subject, field) {
  let object
  if (isDefined(field.originalObject)) {
    object = clone(field.originalObject)
    object.value = field.value
    if (isDefined(object.uri)) {
      object.uri = field.value
    }
  } else {
    object = rdf.Literal.fromValue(field.value)
  }

  return rdf.quad(
    subject,
    field.predicate,
    object,
    getCurrentSource(rdf, field)
  )
}

/**
 * Returns the quad that a field was constructed from or null if it's an ad-hoc
 * field.
 *
 * @param {Object} rdf - An RDF library, currently assumed to be rdflib.js
 * @param {Object} subject - The implicit subject for the field.  Particularly,
 * an RDF subject, currently assumed to be an rdflib.js subject.
 * @param {Field} field - The field on which to find an original quad.
 * @returns {Object} An RDF quad representing the original state of the field.
 */
export function originalQuad (rdf, subject, field) {
  if (!isDefined(field.originalObject)) {
    return null
  }
  return rdf.quad(
    subject,
    field.predicate,
    field.originalObject,
    isDefined(field.originalSource)
      ? field.originalSource
      : undefined
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
    originalObject: field.originalObject,
    originalSource: field.originalSource,
    predicate: field.predicate,
    value: value !== null ? value : field.value,
    listed: listed !== null ? listed : field.listed,
    sourceConfig: field._sourceConfig
  })
}

/**
 * Updpates a field such that it starts tracking its current state rather than
 * its past state.
 *
 * Note that the field returned from this function no longer remembers anything
 * from its previous state.  Therefore if the field used to live on a
 * non-default graph and you toggled listed and then call this function, if you
 * toggle listed again it won't return to the original graph but rather the
 * default.
 *
 * @param {Object} rdf - An RDF library, currently assumed to be rdflib.js
 * @param {Object} subject - The implicit subject for the field.  Particularly,
 * an RDF subject, currently assumed to be an rdflib.js subject.
 * @param {Field} field - The field to be rebuilt from its current state.
 * @returns {Field} A new field tracking the provided field's state as its
 * original state.
 */
export function fromCurrentState (rdf, subject, field) {
  const currentQuad = toQuad(rdf, subject, field)
  return createField({
    predicate: field.predicate,
    originalObject: currentQuad.object,
    originalSource: currentQuad.graph,
    sourceConfig: field._sourceConfig
  })
}
