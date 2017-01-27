import clone from 'lodash/clone'
import uuid from 'node-uuid'
import rdf from 'rdflib'

import { isDefined } from './util'

/**
 * A Field represents, for an implicit subject, a predicate and a value.
 *
 * @typedef {Object} Field
 * @property {Object=} quad - The RDF quad object which this field may have been
 * constructed from.  A field either has a quad or a predicate.
 * @property {Object=} predicate- The RDF predicate which this field represents.
 * A field either has a quad or a predicate.
 * @property {String} id - A UUID.
 * @property value - The value of this field.
 * @param {NamedNode} namedGraph - The URI of a named graph which will be used
 * to hold new fields.
 */

/**
 * Generates a factory for creating fields.
 *
 * @param {String|NamedNode} namedGraph - The URI of a named graph which will be
 * used to hold new fields.
 * @returns {Function} A factory function of one argument, an RDF predicate,
 * which in turn returns a fully configured field object.  The return function
 * also has a `fromQuad` method, which can construct a fully configured field
 * from an RDF quad object.
 */
export function fieldFactory (predicate) {
  const fieldCreator = (value, namedGraph, options = {}) => {
    return new Field({
      predicate,
      value,
      namedNode: options.namedNode,
      namedGraph
    })
  }
  fieldCreator.fromQuad = quad => {
    return new Field({
      predicate: quad.predicate,
      originalObject: quad.object,
      originalNamedGraph: quad.graph
    })
  }
  fieldCreator.predicate = predicate
  return fieldCreator
}

export class Field {
  /**
   * Fields are constructed with a predicate and value.  The value status can
   * either be passed in as 'options.value' or inferred through an RDF object
   * node.
   *
   * In order to fully specify a field, you *must* always pass in
   * 'options.predicate' and one of the following two options:
   * - `value` and `namedGraph` for an ad-hoc field
   * - `originalObject` and `originalNamedGraph` for a field tracking a quad
   *   which may have modified its value
   *
   * @param {Object} options - An options object specifying named parameters.
   * @param {Object=} options.originalObject - The original RDF object node that
   * this field represents if it is being constructed from an existing quad.
   * @param {Object=} options.predicate - The RDF predicate which this field
   * represents.  Must either provide a quad or a predicate.
   * @param options.value - Optionally specifies the current value of this
   * field.  Should only be provided by this field class internally when
   * updating a field.
   * @param {Boolean=} options.namedNode - Whether or not this field is a
   * NamedNode.
   * @param {String|NamedNode} options.namedGraph - The URI of the named graph
   * for this field.
   * @returns {Object} the newly constructed field.
   */
  constructor ({ predicate, namedGraph, value, namedNode, originalObject, originalNamedGraph } = {}) {
    if (!(isDefined(predicate)) ||
        !(isDefined(value) && isDefined(namedGraph)) &&
        !(isDefined(originalObject) && isDefined(originalNamedGraph))) {
      throw new Error('Insufficient arguments.')
    }
    this.predicate = predicate
    // Set default value from the original RDF quad's object and source
    // properties.  This may be overridden by the current value of 'value'.
    if (isDefined(originalObject)) {
      this.originalObject = originalObject
      this.value = rdfToJs(originalObject)
    }
    if (isDefined(originalNamedGraph)) {
      this.originalNamedGraph = rdf.NamedNode.fromValue(originalNamedGraph)
      this.namedGraph = this.originalNamedGraph
    }
    if (isDefined(namedGraph)) {
      this.namedGraph = rdf.NamedNode.fromValue(namedGraph)
    }
    if (isDefined(value)) {
      this.value = value
    }
    if (isDefined(namedNode)) {
      this.namedNode = namedNode || false
    }
    this.id = uuid.v4()
    Object.freeze(this)
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
      // Convert the native JS value back to the corresponding RDF string value
      object.value = this.originalObject.constructor.fromValue(this.value).value
      if (isDefined(object.uri)) {
        object.uri = this.value
      }
    } else {
      object = this.namedNode
        ? rdf.NamedNode.fromValue(this.value)
        : rdf.Literal.fromValue(this.value)
    }

    return rdf.quad(
      subject,
      this.predicate,
      object,
      this.namedGraph || this.originalNamedGraph
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
    if (!isDefined(this.originalObject) && !(isDefined(this.originalNamedGraph))) {
      return null
    }
    return rdf.quad(
      subject,
      this.predicate,
      this.originalObject,
      this.originalNamedGraph
    )
  }

  /**
   * Returns a field with the specified state.
   *
   * @param {Object} options - An options object specifying named parameters.
   * @param options.value - The new field value.
   * @returns {Field} A field with the specified state.
   */
  set ({ value = null, namedGraph = null, namedNode = false }) {
    return new Field({
      originalObject: this.originalObject,
      originalNamedGraph: this.originalNamedGraph,
      namedGraph: namedGraph || this.namedGraph,
      predicate: this.predicate,
      value: value !== null ? value : this.value,
      namedNode
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
      originalNamedGraph: currentQuad.graph,
      namedNode: this.namedNode
    })
  }
}

/**
 * Extracts the value of an rdf node into the native JS representation of that
 * node's type/value.  For example, it will extract booleans from a node with a
 * datatype of xsd:boolean and a value of '0' or '1'.
 *
 * @param {Object} node - The rdf node object.
 * @returns The value of that node.
 */
function rdfToJs (node) {
  let value
  const rdfVal = node.value
  const datatype = node.datatype
  const throwError = () => {
    throw new Error(
      `Cannot parse rdf type/value to JS value.  Given value [${rdfVal}] of type [${datatype}].`
    )
  }
  if (datatype) {
    const XMLSchema = 'http://www.w3.org/2001/XMLSchema#'
    switch (datatype.value) {
      case `${XMLSchema}boolean`:
        if (rdfVal === '1') {
          value = true
        } else if (rdfVal === '0') {
          value = false
        } else {
          throwError()
        }
        break
      case `${XMLSchema}dateTime`:
        // Format of date string can be found at: http://books.xmlschemata.org/relaxng/ch19-77049.html
        value = new Date(rdfVal)
        break
      case `${XMLSchema}decimal`:
      case `${XMLSchema}double`:
        value = Number.parseFloat(rdfVal)
        break
      case `${XMLSchema}integer`:
        value = Number.parseInt(rdfVal)
        break
      case 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString':
      case `${XMLSchema}string`:
      default:
        value = rdfVal
        break
    }
  } else {
    // Assume string if there's no provided datatype
    value = rdfVal
  }
  return value
}
