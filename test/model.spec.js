/* global describe, it */
import expect from 'expect'
import Immutable from 'immutable'
import rdf from 'rdflib'
import solidNs from 'solid-namespace'

import * as Field from '../src/field'
import { modelFactory } from '../src/index'

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
    const profileModel = modelFactory(rdf, {
      name,
      phone
    })
    model = profileModel(graph, webId)
  })

  it('can get fields by name', () => {
    const nameFields = model.get('name')
    const nameField = nameFields[0]
    const phoneFields = model.get('phone')
    expect(nameFields.length).toEqual(1)
    expect(nameField.value).toEqual('Mr. Cool')
    expect(phoneFields.length).toEqual(2)
    expect(phoneFields.map(field => field.value))
      .toEqual(['tel:123-456-7890', 'tel:098-765-4321'])
  })

  it('returns an empty array for undefined field names', () => {
    expect(model.get('undefined-field')).toEqual([])
  })

  it('can add new fields', () => {
    const nameFields = model.get('name')
    const newModel = model.add('name', name('Ms. Cool'))
    expect(newModel.get('name').map(field => field.value))
      .toEqual(['Mr. Cool', 'Ms. Cool'])
  })

  it('can remove existing fields', () => {
    const firstPhone = model.get('phone')[0]
    const secondPhone = model.get('phone')[1]
    const updatedModel = model.remove('phone', firstPhone)
    expect(updatedModel.get('phone')).toEqual([secondPhone])
  })

  it('can change the value of contained fields', () => {
    const firstPhone = model.get('phone')[0]
    const secondPhone = model.get('phone')[1]
    const newPhone = phone('tel:000-000-0000')
    const updatedModel = model.set('phone', firstPhone, newPhone)
    expect(updatedModel.get('phone').length).toBe(2)
    expect(updatedModel.get('phone')[0]._quad).toEqual(firstPhone._quad)
    expect(updatedModel.get('phone')[0].value).toEqual(newPhone.value)
    expect(updatedModel.get('phone')[1]).toEqual(secondPhone)
  })

  describe('diffing', () => {
    it('shows no changes for an unchanged model', () => {
      expect(model._diff(rdf)).toEqual({})
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
          const updatedModel = model.add('phone', newPhone)
          const expectedDiff = {}
          expectedDiff[uri] = {}
          expectedDiff[uri].toDel = []
          expectedDiff[uri].toIns = [Field.toQuad(rdf, subject, newPhone).toString()]
          expect(updatedModel._diff(rdf)).toEqual(expectedDiff)
        })
      })
    })

    describe('after removing fields', () => {
      it('shows that a field should be removed from the graph', () => {
        const listedURI = sourceConfig.defaultSources.listed
        const removedPhone = model.get('phone')[1]
        const updatedModel = model.remove('phone', removedPhone)
        const expectedDiff = {}
        expectedDiff[listedURI] = {}
        expectedDiff[listedURI].toDel = [Field.toQuad(rdf, subject, removedPhone).toString()]
        expectedDiff[listedURI].toIns = []
        expect(updatedModel._diff(rdf)).toEqual(expectedDiff)
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
          const oldPhone = model.get('phone')[1]
          const oldPhoneURI = oldPhone._quad.graph.value
          const updatedModel = model.set('phone', oldPhone, fieldData)
          const expectedDiff = {}
          expectedDiff[oldPhoneURI] = {}
          expectedDiff[newPhoneURI] = {}
          expectedDiff[oldPhoneURI].toIns = []
          expectedDiff[newPhoneURI].toDel = []
          expectedDiff[oldPhoneURI].toDel = [Field.toQuad(rdf, subject, oldPhone).toString()]
          expectedDiff[newPhoneURI].toIns = [
            Field.toQuad(rdf, subject, updatedModel.get('phone')[1]).toString()
          ]
          expect(updatedModel._diff(rdf)).toEqual(expectedDiff)
        })
      })
    })
  })
})
