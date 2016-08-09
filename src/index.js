import Immutable from 'immutable'

import Field from './field'
import Model from './model'

export function createModel (rdf, graph, subject, fieldCreators) {
  const fields = Immutable.Map(
    Object.keys(fieldCreators).reduce((prevFields, fieldName) => {
      const fieldCreator = fieldCreators[fieldName]
      const matchingQuads = graph
        .statementsMatching(rdf.sym(subject), fieldCreator.predicate)
      console.log(fieldCreator.predicate)
      // console.log(matchingQuads)
      const matchingFields = matchingQuads.map(quad => fieldCreator.fromQuad(quad))
      return Object.assign(prevFields, {[fieldName]: matchingFields})
    }, {})
  )

  return new Model(fields)
}

export function saveModel (model) {}
