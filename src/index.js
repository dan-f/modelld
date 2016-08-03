import Immutable from 'immutable'
import $rdf from 'rdflib'

import Field from './field'
import Model from './model'

export function createModel (graph, subject, schema) {
  const fields = Immutable.Map(
    Object.keys(schema).reduce((prevFields, fieldName) => {
      const matchingStmts = graph
        .statementsMatching($rdf.sym(subject), schema[fieldName])
      const fieldVal = matchingStmts.length > 1
        ? matchingStmts.map(stmt => new Field(stmt))
        : new Field(matchingStmts[0])
      return Object.assign(prevFields, {[fieldName]: fieldVal})
    }, {})
  )

  return new Model(fields)
}

export function saveModel (model) {}
