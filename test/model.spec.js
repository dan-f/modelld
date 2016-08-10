/* global describe, it */
import expect from 'expect'
import Immutable from 'immutable'
import rdf from 'rdflib'
import solidNs from 'solid-namespace'

import { fieldFactory } from '../src/field'
import { createModel } from '../src/index'

const vocab = solidNs(rdf)

describe('Model', () => {
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
    const subject = rdf.sym(webId)
    const graph = rdf.graph()
    rdf.parse(profile, graph, profileURI, 'text/turtle')

    const field = fieldFactory({
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
    })
    name = field(vocab.foaf('name'))
    phone = field(vocab.foaf('phone'))
    model = createModel(rdf, graph, webId, {
      name,
      phone
    })
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
    expect(updatedModel.get('phone')).toEqual([newPhone, secondPhone])
  })
})
