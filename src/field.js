import clone from 'lodash/clone'
import uuid from 'node-uuid'
import { isUri } from 'valid-url'

import { isDefined } from './util'

/**
 * A Field represents, for an implicit subject, a predicate, a value, and
 * whether or not this field is public (listed).
 *
 * @typedef {Object} Field
 * @property {Object=} quad - The RDF quad object which this field may have been
 * constructed from.  A field either has a quad or a predicate.
 * @property {Object=} predicate- The RDF predicate which this field represents.
 * A field either has a quad or a predicate.
 * @property {String} id - A UUID.
 * @property value - The value of this field.
 * @property {Boolean} listed - Whether or not this field is listed (public) or
 * unlisted (private).
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
      return new Field({
        predicate,
        value,
        listed: options.listed,
        sourceConfig
      })
    }
    fieldCreator.fromQuad = quad => {
      return new Field({
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

export class Field {
  /**
   * Fields are constructed with a predicate, value, and listed status.  The
   * value and listed status can either be passed in as 'options.value' and
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
   * this field represents if it is being constructed from an existing quad.
   * @param {Object=} options.originalSource - The original RDF graph node
   * representing the source of this field if it is being constructed from an
   * existing quad.
   * @param {Object=} options.predicate - The RDF predicate which this field
   * represents.  Must either provide a quad or a predicate.
   * @param options.value - Optionally specifies the current value of this
   * field.  Should only be provided by this field class internally when
   * updating a field.
   * @param {Boolean=} options.listed - Whether or not this field is listed
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
  constructor ({ predicate, value, listed, originalObject, originalSource, sourceConfig } = {}) {
    if (!(isDefined(predicate) && isDefined(sourceConfig)) ||
        !(isDefined(value) || (isDefined(originalObject)))) {
      throw new Error('Insufficient arguments.')
    }
    this.predicate = predicate
    // Set default 'value' and 'listed' values from the original RDF quad's object
    // and source properties.  This may be overridden by the current values of
    // 'value' and 'listed'.
    if (isDefined(originalObject)) {
      this.originalObject = originalObject
      this.value = originalObject.value
    }
    if (isDefined(originalSource)) {
      this.originalSource = originalSource
      this.listed = sourceConfig.sourceIndex[originalSource.value]
    }
    if (isDefined(value)) {
      this.value = value
    }
    if (isDefined(listed)) {
      this.listed = listed
    } else {
      // If we haven't already set a listed value, default to false.
      this.listed = isDefined(this.listed)
        ? this.listed
        : false
    }
    this._sourceConfig = sourceConfig
    this.id = uuid.v4()
    Object.freeze(this)
  }

  /**
   * Gets the current source of this field.
   *
   * Handles edge cases in which a field may be repeatedly toggled
   * listed/unlisted.  Sometimes a field's source should not be the default
   * listed/unlisted source, but the one that this field originally came from.
   *
   * @param {Object} rdf - An RDF library, currently assumed to be rdflib.js
   * @returns {Object} - The RDF graph object containing the current source of
   * this field.
   */
  getCurrentSource (rdf) {
    const { defaultSources, sourceIndex } = this._sourceConfig
    // unfamiliar URIs (those not in the source config) are considered unlisted
    const uriIsListed = uri => sourceIndex[uri] || false

    let sourceURI
    if (isDefined(this.originalSource) &&
        this.listed === uriIsListed(this.originalSource.value)) {
      sourceURI = this.originalSource.value
    } else {
      sourceURI = this.listed ? defaultSources.listed : defaultSources.unlisted
    }
    return rdf.namedNode(sourceURI)
  }

  /**
   * Generates an RDF quad representing this field's current state.
   *
   * @param {Object} rdf - An RDF library, currently assumed to be rdflib.js
   * @param {Object} subject - The implicit subject for this field.
   * Particularly, an RDF subject, currently assumed to be an rdflib.js subject.
   * @returns {Object} An RDF quad representing the current state of this field.
   */
  toQuad (rdf, subject) {
    let object
    if (isDefined(this.originalObject)) {
      object = clone(this.originalObject)
      object.value = this.value
      if (isDefined(object.uri)) {
        object.uri = this.value
      }
    } else {
      object = isUri(this.value)
        ? rdf.namedNode(this.value)
        : rdf.Literal.fromValue(this.value)
    }

    return rdf.quad(
      subject,
      this.predicate,
      object,
      this.getCurrentSource(rdf)
    )
  }

  /**
   * Returns the quad that a field was constructed from or null if it's an
   * ad-hoc field.
   *
   * @param {Object} rdf - An RDF library, currently assumed to be rdflib.js
   * @param {Object} subject - The implicit subject for this field.
   * Particularly, an RDF subject, currently assumed to be an rdflib.js subject.
   * @returns {Object} An RDF quad representing the original state of this
   * field.
   */
  originalQuad (rdf, subject) {
    if (!isDefined(this.originalObject)) {
      return null
    }
    return rdf.quad(
      subject,
      this.predicate,
      this.originalObject,
      isDefined(this.originalSource)
        ? this.originalSource
        : undefined
    )
  }

  /**
   * Creates a field with the opposite listed value as the provided field.
   *
   * @returns {Field} a new field with the opposite listed value as the provided
   * field.
   */
  toggleListed () {
    return this.set({listed: !this.listed})
  }

  /**
   * Returns a field with the specified state.
   *
   * @param {Object} options - An options object specifying named parameters.
   * @param options.value - The new field value.
   * @param {Boolean} options.listed - The new listed value.
   * @returns {Field} A field with the specified state.
   */
  set ({ value = null, listed = null }) {
    return new Field({
      originalObject: this.originalObject,
      originalSource: this.originalSource,
      predicate: this.predicate,
      value: value !== null ? value : this.value,
      listed: listed !== null ? listed : this.listed,
      sourceConfig: this._sourceConfig
    })
  }

  /**
   * Updpates a field such that it starts tracking its current state rather than
   * its past state.
   *
   * Note that this field returned from this function no longer remembers
   * anything from its previous state.  Therefore if this field used to live on
   * a non-default graph and you toggled listed and then call this function, if
   * you toggle listed again it won't return to the original graph but rather
   * the default.
   *
   * @param {Object} rdf - An RDF library, currently assumed to be rdflib.js
   * @param {Object} subject - The implicit subject for this field.  Particularly,
   * an RDF subject, currently assumed to be an rdflib.js subject.
   * @param {Field} field - This field to be rebuilt from its current state.
   * @returns {Field} A new field tracking the provided field's state as its
   * original state.
   */
  fromCurrentState (rdf, subject) {
    const currentQuad = this.toQuad(rdf, subject)
    return new Field({
      predicate: this.predicate,
      originalObject: currentQuad.object,
      originalSource: currentQuad.graph,
      sourceConfig: this._sourceConfig
    })
  }
}
