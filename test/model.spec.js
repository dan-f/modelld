/* global describe, it */
import expect from 'expect'
import Immutable from 'immutable'
import rdf from 'rdflib'
import solidNs from 'solid-namespace'

import * as Field from '../src/field'
import * as Model from '../src/model'

const vocab = solidNs(rdf)

describe('Model', () => {
  let sourceConfig
  let subject
  let name
  let phone
  let model

  beforeEach(() => {
    const webId = 'http://mr-cool.example.com/profile/card#me'
    const profileURI = 'http://mr-cool.example.com/profile/card'
    const profile = `
      @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
      <>
          a <http://xmlns.com/foaf/0.1/PersonalProfileDocument> ;
          <http://xmlns.com/foaf/0.1/maker> <#me> ;
          <http://xmlns.com/foaf/0.1/primaryTopic> <#me> .
      <#me>
          a <http://xmlns.com/foaf/0.1/Person> ;
          <http://www.w3.org/ns/pim/space#preferencesFile> <../Preferences/prefs.ttl> ;
          <http://www.w3.org/ns/pim/space#storage> <../> ;
          <http://www.w3.org/ns/solid/terms#inbox> <../Inbox/> ;
          <http://www.w3.org/ns/solid/terms#publicTypeIndex> <publicTypeIndex.ttl> ;
          <http://www.w3.org/ns/solid/terms#timeline> <../Timeline/> ;
          <http://xmlns.com/foaf/0.1/familyName> "Cool" ;
          <http://xmlns.com/foaf/0.1/givenName> "Mr." ;
          <http://xmlns.com/foaf/0.1/img> <mr_cool.jpg> ;
          <http://xmlns.com/foaf/0.1/mbox> <mailto:mr_cool@example.com> ;
          <http://xmlns.com/foaf/0.1/name> "Mr. Cool" ;
          <http://xmlns.com/foaf/0.1/phone> <tel:123-456-7890> ;
          <http://xmlns.com/foaf/0.1/phone> <tel:098-765-4321> .
    `
    subject = rdf.sym(webId)
    const graph = rdf.graph()
    rdf.parse(profile, graph, profileURI, 'text/turtle')

    sourceConfig = {
      defaultSources: {
        listed: profileURI,
        unlisted: 'http://mr-cool.example.com/unlisted'
      },
      sourceIndex: {
       'http://mr-cool.example.com/profile/card': true,
       'http://mr-cool.example.com/listed': true,
       'http://mr-cool.example.com/another-listed': true,
       'http://mr-cool.example.com/unlisted': false,
       'http://mr-cool.example.com/another-unlisted': false
      }
    }
    const field = Field.fieldFactory(sourceConfig)
    name = field(vocab.foaf('name'))
    phone = field(vocab.foaf('phone'))
    const profileModel = Model.modelFactory(rdf, {
      name,
      phone
    })
    model = profileModel(graph, webId)
  })

  it('can get fields by name', () => {
    const nameFields = Model.get(model, 'name')
    const nameField = nameFields[0]
    const phoneFields = Model.get(model, 'phone')
    expect(nameFields.length).toEqual(1)
    expect(nameField.value).toEqual('Mr. Cool')
    expect(phoneFields.length).toEqual(2)
    expect(phoneFields.map(field => field.value))
      .toEqual(['tel:123-456-7890', 'tel:098-765-4321'])
  })

  it('returns an empty array for undefined field names', () => {
    expect(Model.get(model, 'undefined-field')).toEqual([])
  })

  it('can add new fields', () => {
    const nameFields = Model.get(model, 'name')
    const newModel = Model.add(model, 'name', name('Ms. Cool'))
    expect(Model.get(newModel, 'name').map(field => field.value))
      .toEqual(['Mr. Cool', 'Ms. Cool'])
  })

  it('can remove existing fields', () => {
    const firstPhone = Model.get(model, 'phone')[0]
    const secondPhone = Model.get(model, 'phone')[1]
    const updatedModel = Model.remove(model, 'phone', firstPhone)
    expect(Model.get(updatedModel, 'phone')).toEqual([secondPhone])
  })

  it('can not remove fields which do not belong to the model', () => {
    const notOwnedPhone = phone('tel:444-444-4444')
    expect(Model.remove(model, 'phone', phone)).toEqual(model)
  })

  it('can change the value of contained fields', () => {
    const firstPhone = Model.get(model, 'phone')[0]
    const secondPhone = Model.get(model, 'phone')[1]
    const newPhone = phone('tel:000-000-0000')
    const updatedModel = Model.set(model, 'phone', firstPhone, newPhone)
    expect(Model.get(updatedModel, 'phone').length).toBe(2)
    expect(Model.get(updatedModel, 'phone')[0]._quad).toEqual(firstPhone._quad)
    expect(Model.get(updatedModel, 'phone')[0].value).toEqual(newPhone.value)
    expect(Model.get(updatedModel, 'phone')[1]).toEqual(secondPhone)
  })

  describe('diffing', () => {
    it('shows no changes for an unchanged model', () => {
      expect(Model.diff(rdf, model)).toEqual({})
    })

    describe('after adding fields', () => {
      const testData = [
        {value: 'tel:000-000-0000', listed: true},
        {value: 'tel:111-111-1111', listed: false}
      ]
      testData.forEach(fieldData => {
        it(`shows that a ${fieldData.listed ? 'listed' : 'unlisted'} field should be inserted into the graph`, () => {
          const uri = fieldData.listed
            ? sourceConfig.defaultSources.listed
            : sourceConfig.defaultSources.unlisted
          const newPhone = phone(fieldData.value, {listed: fieldData.listed})
          const updatedModel = Model.add(model, 'phone', newPhone)
          const expectedDiff = {}
          expectedDiff[uri] = {}
          expectedDiff[uri].toDel = []
          expectedDiff[uri].toIns = [
            Field.toQuad(rdf, subject, newPhone).toString()
          ]
          expect(Model.diff(rdf, updatedModel)).toEqual(expectedDiff)
        })
      })
    })

    describe('after removing fields', () => {
      it('shows that a field should be removed from the graph', () => {
        const listedURI = sourceConfig.defaultSources.listed
        const removedPhone = Model.get(model, 'phone')[1]
        const updatedModel = Model.remove(model, 'phone', removedPhone)
        const expectedDiff = {}
        expectedDiff[listedURI] = {}
        expectedDiff[listedURI].toDel = [
          Field.toQuad(rdf, subject, removedPhone).toString()
        ]
        expectedDiff[listedURI].toIns = []
        expect(Model.diff(rdf, updatedModel)).toEqual(expectedDiff)
      })
    })

    describe('after updating fields', () => {
      const testData = [
        {value: 'tel:000-000-0000', listed: true},
        {value: 'tel:111-111-1111', listed: false}
      ]
      testData.forEach(fieldData => {
        it(`shows that a ${fieldData.listed ? 'listed' : 'unlisted'} field should be added to and removed from the graph`, () => {
          const newPhoneURI = fieldData.listed
            ? sourceConfig.defaultSources.listed
            : sourceConfig.defaultSources.unlisted
          const oldPhone = Model.get(model, 'phone')[1]
          const oldPhoneURI = oldPhone._quad.graph.value
          const updatedModel = Model.set(model, 'phone', oldPhone, fieldData)
          const expectedDiff = {}
          expectedDiff[oldPhoneURI] = {}
          expectedDiff[newPhoneURI] = {}
          expectedDiff[oldPhoneURI].toIns = []
          expectedDiff[newPhoneURI].toDel = []
          expectedDiff[oldPhoneURI].toDel = [
            Field.toQuad(rdf, subject, oldPhone).toString()
          ]
          expectedDiff[newPhoneURI].toIns = [
            Field.toQuad(rdf, subject, Model.get(updatedModel, 'phone')[1])
              .toString()
          ]
          expect(Model.diff(rdf, updatedModel)).toEqual(expectedDiff)
        })
      })
    })
  })
})
