import clone from 'lodash/clone'
import uuid from 'node-uuid'

import { isDefined } from './util'

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
      return new Field({quad, sourceConfig})
    }
    fieldCreator.predicate = predicate
    return fieldCreator
  }
}

/**
 * A Field represents, for an implicit subject, a predicate, a value, and
 * whether or not the field is public (listed).
 */
export class Field {
  /**
   * Fields are constructed with a predicate, value, and listed status which can
   * either be specified via an RDF quad, or ad hoc values.
   *
   * @constructor
   *
   * @param {Object} options - An options object specifying named parameters.
   * @param {RDF quad} options.quad - The original RDF statement which this
   * field represents.  This statement tracks the original value of the field.
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
   * @returns {Field} the newly constructed field object.
   */
  constructor ({ quad, predicate, value, listed, sourceConfig }) {
    if (isDefined(quad) && isDefined(predicate)) {
      throw new Error('Must provide either quad or predicate, but not both.')
    }
    if (isDefined(quad)) {
      const { sourceIndex } = sourceConfig
      this._quad = quad
      this._value = quad.object.value
      this._listed = isDefined(quad.graph)
        ? sourceIndex[quad.graph.value]
        : false
    }
    if (isDefined(predicate)) {
      this._predicate = predicate
    }
    if (isDefined(value)) {
      this._value = value
    }
    if (isDefined(listed)) {
      this._listed = listed
    } else {
      // If we haven't already set a listed value, default to true.
      this._listed = isDefined(this._listed)
        ? this._listed
        : false
    }
    this._sourceConfig = sourceConfig
    this._id = uuid.v4()
  }

  /**
   * Gets the current value of the field.
   *
   * @returns {String} the current field value.
   */
  get value () {
    return this._value
  }

  /**
   * Exists to document the proper way to set a fields value.
   */
  set value (newVal) {
    throw new Error('Use .set() method to change a field\'s value')
  }

  /**
   * Gets the current listed (public/private) value.
   *
   * @returns {Boolean} whether the field is listed.
   */
  get listed () {
    return this._listed
  }

  /**
   * Exists to document the proper way to set a fields listed value.
   */
  set listed (newListedVal) {
    throw new Error('Use .set() method to change a field\'s listed value')
  }

  /**
   * Gets a field object with the opposite listed value as the current field.
   *
   * @returns {Field} a new field object with the opposite listed value as the
   * current field.
   */
  toggleListed () {
    return this.set({listed: !this._listed})
  }

  /**
   * Changes the value and/or listing value of this field.  Because fields are
   * immutable, this returns a new Field object with the corresponding new
   * values.
   *
   * @param {Object} options - An options object specifying named parameters.
   * @param {String} options.value - The new value for this field.
   * @param {Boolean} options.listed - The new listing value for this field.
   * @returns {Field} A new field object with the specified state.
   */
  set ({ value = null, listed = null }) {
    return new Field({
      quad: this._quad,
      predicate: this._predicate,
      value: value !== null ? value : this._value,
      listed: listed !== null ? listed : this._listed,
      sourceConfig: this._sourceConfig
    })
  }

  /**
   * Generates an RDF quad representing the current state of the field.
   *
   * @param {Object} rdf - An RDF library, currently assumed to be rdflib.js
   * @param {Object} subject - The implicit subject for this field.
   * Particularly, an RDF subject, currently assumed to be an rdflib.js subject.
   * @returns {Object} An RDF quad representing the current state of this field.
   */
  _toQuad (rdf, subject) {
    const { defaultSources, sourceIndex } = this._sourceConfig
    let sourceURI
    if (isDefined(this._quad)
        && this.listed === sourceIndex[this._quad.graph.value]) {
      sourceURI = this._quad.graph.value
    } else {
      sourceURI = this.listed ? defaultSources.listed : defaultSources.unlisted
    }
    let object
    if (isDefined(this._quad)) {
      object = clone(this._quad.object)
      object.value = this._value
    } else {
      object = rdf.Literal.fromValue(this._value)
    }
    return rdf.quad(
      subject,
      isDefined(this._quad) ? this._quad.predicate : this._predicate,
      object,
      rdf.namedNode(sourceURI)
    )
  }
}
