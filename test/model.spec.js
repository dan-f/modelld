/* global beforeEach, describe, it */
import expect from 'expect'
import rdf from 'rdflib'
import { spy } from 'sinon'
import solidNs from 'solid-namespace'

import * as Field from '../src/field'
import * as Model from '../src/model'

const vocab = solidNs(rdf)

describe('Model', () => {
  // Constants available for use within describe() blocks
  const profileURI = 'http://mr-cool.example.com/profile/card'
  const webId = `${profileURI}#me`
  const sourceConfig = {
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

  // These are dynamically set in beforeEach meaning they're only available
  // within it() blocks.
  let subject
  let name
  let phone
  let model

  beforeEach(() => {
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
    expect(Model.remove(model, 'phone', notOwnedPhone)).toEqual(model)
  })

  it('can change the value of contained fields', () => {
    const firstPhone = Model.get(model, 'phone')[0]
    const secondPhone = Model.get(model, 'phone')[1]
    const newPhone = phone('tel:000-000-0000')
    const updatedModel = Model.set(model, 'phone', firstPhone, newPhone)
    expect(Model.get(updatedModel, 'phone').length).toBe(2)
    expect(Model.get(updatedModel, 'phone')[0].quad).toEqual(firstPhone.quad)
    expect(Model.get(updatedModel, 'phone')[0].value).toEqual(newPhone.value)
    expect(Model.get(updatedModel, 'phone')[1]).toEqual(secondPhone)
  })

  describe('diffing', () => {
    describe('for unchanged models', () => {
      it('shows no changes', () => {
        expect(Model.diff(rdf, model)).toEqual({})
      })
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
          const oldPhoneURI = oldPhone.originalSource.value
          const updatedModel = Model.set(model, 'phone', oldPhone, fieldData)
          const expectedDiff = {}
          expectedDiff[oldPhoneURI] = {toIns: [], toDel: []}
          expectedDiff[newPhoneURI] = {toIns: [], toDel: []}
          expectedDiff[oldPhoneURI].toDel.push(
            `<${webId}> ${vocab.foaf('phone')} <${oldPhone.value}> .`
          )
          expectedDiff[newPhoneURI].toIns.push(
            `<${webId}> ${vocab.foaf('phone')} <${fieldData.value}> .`
          )
          expect(Model.diff(rdf, updatedModel)).toEqual(expectedDiff)
        })
      })
    })
  })

  describe('saving', () => {
    const createSpies = () => {
      const patchSpy = spy((uri, toDel, toIns) => Promise.resolve())
      const webClientSpy = spy(rdf => { return {patch: patchSpy} })
      return {patchSpy, webClientSpy}
    }

    const expectWebCalls = (webClientSpy, patchSpy, patchCalls) => {
      // Expect that the web client was initialized with the rdf library
      expect(webClientSpy.callCount).toBe(1)
      expect(webClientSpy.calledWith(rdf)).toBe(true)
      // Expect that the web client's patch method was properly called
      expect(patchSpy.callCount).toBe(patchCalls.length)
      patchCalls.forEach(call => {
        expect(patchSpy.calledWith(...call)).toBe(true)
      })
    }

    describe('for unchanged models', () => {
      it('should return the current model', () => {
        const {patchSpy, webClientSpy} = createSpies()
        return Model
          .save(rdf, webClientSpy, model)
          .then(updatedModel => {
            expect(webClientSpy.called).toBe(false)
            expect(patchSpy.called).toBe(false)
            expect(updatedModel).toEqual(model)
          })
      })
    })

    describe('after adding fields', () => {
      const testData = [
        {
          fieldData: {
            value: 'tel:000-000-0000',
            listed: true
          },
          expectedPatchCalls: [
            [
              sourceConfig.defaultSources.listed,
              [],
              // Note that all new fields are considered literals, hence the
              // double quotes.
              [`<${webId}> ${vocab.foaf('phone')} "tel:000-000-0000" .`]
            ]
          ]
        },
        {
          fieldData: {
            value: 'tel:111-111-1111',
            listed: false
          },
          expectedPatchCalls: [
            [
              sourceConfig.defaultSources.unlisted,
              [],
              // Note that all new fields are considered literals, hence the
              // double quotes.
              [`<${webId}> ${vocab.foaf('phone')} "tel:111-111-1111" .`]
            ]
          ]
        }
      ]
      testData.forEach(({fieldData, expectedPatchCalls}) => {
        it(`should patch the new field's URI for a ${fieldData.listed ? 'listed' : 'unlisted'} field and return the updated model`, () => {
          const {patchSpy, webClientSpy} = createSpies()
          const newPhone = phone(fieldData.value, {listed: fieldData.listed})
          const modelPlusField = Model.add(
            model, 'phone', newPhone
          )
          return Model
            .save(rdf, webClientSpy, modelPlusField)
            .then(newModel => {
              expectWebCalls(webClientSpy, patchSpy, expectedPatchCalls)
              const phones = Model.get(newModel, 'phone')
              expect(phones.length).toBe(3)
              // The new field should now be tracking its previously "new" state
              // as its "old" state in the .quad property.
              expect(phones[2].originalObject).toEqual(
                rdf.Literal.fromValue(fieldData.value)
              )
              expect(phones[2].originalSource).toEqual(
                rdf.namedNode(
                  fieldData.listed
                    ? sourceConfig.defaultSources.listed
                    : sourceConfig.defaultSources.unlisted
                )
              )
              expect(Model.diff(rdf, newModel)).toEqual({})
            })
        })
      })
    })

    describe('after removing fields', () => {
      it('should patch the removed field\'s URI and return the updated model', () => {
        const {patchSpy, webClientSpy} = createSpies()
        const removedPhone = Model.get(model, 'phone')[1]
        const modelMinusField = Model.remove(
          model, 'phone', removedPhone
        )
        const uri = sourceConfig.defaultSources.listed
        return Model
          .save(rdf, webClientSpy, modelMinusField)
          .then(newModel => {
            expectWebCalls(webClientSpy, patchSpy, [
              [
                uri,
                [Field.toQuad(rdf, subject, removedPhone).toString()],
                []
              ]
            ])
            const phones = Model.get(newModel, 'phone')
            expect(phones.length).toBe(1)
            expect(Model.diff(rdf, newModel)).toEqual({})
          })
      })
    })

    describe('after updating fields', () => {
      const testData = [
        {
          fieldData: {
            value: 'tel:000-000-0000',
            listed: true
          },
          expectedPatchCalls: [
            [
              sourceConfig.defaultSources.listed,
              // Assume that we are updating the second phone number in the
              // profile.
              [`<${webId}> ${vocab.foaf('phone')} <tel:098-765-4321> .`],
              [`<${webId}> ${vocab.foaf('phone')} <tel:000-000-0000> .`]
            ]
          ]
        },
        {
          fieldData: {
            value: 'tel:111-111-1111',
            listed: false
          },
          expectedPatchCalls: [
            [
              sourceConfig.defaultSources.listed,
              // Assume that we are updating the second phone number in the
              // profile.
              [`<${webId}> ${vocab.foaf('phone')} <tel:098-765-4321> .`],
              []
            ],
            [
              sourceConfig.defaultSources.unlisted,
              [],
              [`<${webId}> ${vocab.foaf('phone')} <tel:111-111-1111> .`]
            ]
          ]
        }
      ]
      testData.forEach(({fieldData, expectedPatchCalls}) => {
        it(`should patch the new and removed field URIs for a ${fieldData.listed ? 'listed' : 'unlisted'} field and update the model`, () => {
          const {patchSpy, webClientSpy} = createSpies()
          const removedPhone = Model.get(model, 'phone')[1]
          const updatedModel = Model.set(
            model, 'phone', removedPhone, fieldData
          )
          return Model
            .save(rdf, webClientSpy, updatedModel)
            .then(newModel => {
              expectWebCalls(webClientSpy, patchSpy, expectedPatchCalls)
              expect(Model.get(newModel, 'phone').length).toBe(2)
              expect(Model.diff(rdf, newModel)).toEqual({})
            })
        })
      })
    })
  })
})
