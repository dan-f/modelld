import Immutable from 'immutable'
import $rdf from 'rdflib'

import Field from './field'
import Model from './model'

export function createModel (graph, subject, schema) {
  const fields = Immutable.Map(
    Object.keys(schema).reduce((prevFields, fieldName) => {
      const matchingStmts = graph
        .statementsMatching($rdf.sym(subject), schema[fieldName])
      const field = new Field(matchingStmts)
      return Object.assign(prevFields, {[fieldName]: field})
    }, {})
  )

  return new Model(fields)
}

export function saveModel (model) {}
