/* global beforeEach, describe, it */
import expect from 'expect'
import rdf from 'rdflib'
import { spy } from 'sinon'
import solidNs from 'solid-namespace'

import { fieldFactory } from '../src/field'
import { modelFactory } from '../src/model'

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

    const field = fieldFactory(sourceConfig)
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
    const newModel = model.add('name', name('Ms. Cool'))
    expect(newModel.get('name').map(field => field.value))
      .toEqual(['Mr. Cool', 'Ms. Cool'])
  })

  it('can remove existing fields', () => {
    const firstPhone = model.get('phone')[0]
    const secondPhone = model.get('phone')[1]
    const updatedModel = model.remove(firstPhone)
    expect(updatedModel.get('phone')).toEqual([secondPhone])
  })

  it('can not remove fields which do not belong to the model', () => {
    const notOwnedPhone = phone('tel:444-444-4444')
    expect(model.remove(notOwnedPhone)).toEqual(model)
  })

  it('can change the value of contained fields', () => {
    const firstPhone = model.get('phone')[0]
    const secondPhone = model.get('phone')[1]
    const newPhone = phone('tel:000-000-0000')
    const updatedModel = model.set(firstPhone, newPhone)
    const phones = updatedModel.get('phone')
    expect(phones.length).toBe(2)
    expect(phones[0].quad).toEqual(firstPhone.quad)
    expect(phones[0].value).toEqual(newPhone.value)
    expect(phones[1]).toEqual(secondPhone)
  })

  describe('diffing', () => {
    describe('for unchanged models', () => {
      it('shows no changes', () => {
        expect(model.diff(rdf)).toEqual({})
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
          const updatedModel = model.add('phone', newPhone)
          const expectedDiff = {}
          expectedDiff[uri] = {}
          expectedDiff[uri].toDel = []
          expectedDiff[uri].toIns = [
            newPhone.toQuad(rdf, subject).toString()
          ]
          expect(updatedModel.diff(rdf)).toEqual(expectedDiff)
        })
      })
    })

    describe('after removing fields', () => {
      it('shows that a field should be removed from the graph', () => {
        const listedURI = sourceConfig.defaultSources.listed
        const removedPhone = model.get('phone')[1]
        const updatedModel = model.remove(removedPhone)
        const expectedDiff = {}
        expectedDiff[listedURI] = {}
        expectedDiff[listedURI].toDel = [
          removedPhone.toQuad(rdf, subject).toString()
        ]
        expectedDiff[listedURI].toIns = []
        expect(updatedModel.diff(rdf)).toEqual(expectedDiff)
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
          const oldPhoneURI = oldPhone.originalSource.value
          const updatedModel = model.set(oldPhone, fieldData)
          const expectedDiff = {}
          expectedDiff[oldPhoneURI] = {toIns: [], toDel: []}
          expectedDiff[newPhoneURI] = {toIns: [], toDel: []}
          expectedDiff[oldPhoneURI].toDel.push(
            `<${webId}> ${vocab.foaf('phone')} <${oldPhone.value}> .`
          )
          expectedDiff[newPhoneURI].toIns.push(
            `<${webId}> ${vocab.foaf('phone')} <${fieldData.value}> .`
          )
          expect(updatedModel.diff(rdf)).toEqual(expectedDiff)
        })
      })
    })
  })

  describe('saving', () => {
    const createSpies = ({failPatchFor = null} = {}) => {
      const patchSpy = spy((url, toDel, toIns) => {
        return failPatchFor === url
          ? Promise.reject({url})
          : Promise.resolve({url})
      })
      const webClientSpy = spy(rdf => ({patch: patchSpy}))
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
        return model
          .save(rdf, webClientSpy)
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
          const modelPlusField = model.add('phone', newPhone)
          return modelPlusField
            .save(rdf, webClientSpy)
            .then(newModel => {
              expectWebCalls(webClientSpy, patchSpy, expectedPatchCalls)
              const phones = newModel.get('phone')
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
              expect(newModel.diff(rdf)).toEqual({})
            })
        })
      })
    })

    describe('after removing fields', () => {
      it('should patch the removed field\'s URI and return the updated model', () => {
        const {patchSpy, webClientSpy} = createSpies()
        const removedPhone = model.get('phone')[1]
        const modelMinusField = model.remove(removedPhone)
        const uri = sourceConfig.defaultSources.listed
        return modelMinusField
          .save(rdf, webClientSpy)
          .then(newModel => {
            expectWebCalls(webClientSpy, patchSpy, [
              [
                uri,
                [removedPhone.toQuad(rdf, subject).toString()],
                []
              ]
            ])
            const phones = newModel.get('phone')
            expect(phones.length).toBe(1)
            expect(newModel.diff(rdf)).toEqual({})
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
          const removedPhone = model.get('phone')[1]
          const updatedModel = model.set(removedPhone, fieldData)
          return updatedModel
            .save(rdf, webClientSpy)
            .then(newModel => {
              expectWebCalls(webClientSpy, patchSpy, expectedPatchCalls)
              expect(newModel.get('phone').length).toBe(2)
              expect(newModel.diff(rdf)).toEqual({})
            })
        })
      })
    })

    describe('after a failed patch', () => {
      it('should return a model with updated fields for only those which were successfully updated', () => {
        const listedURI = sourceConfig.defaultSources.listed
        const unlistedURI = sourceConfig.defaultSources.unlisted
        const {patchSpy, webClientSpy} = createSpies({failPatchFor: unlistedURI})
        let newModel = model.add('phone', phone('tel:000-000-0000', {listed: true}))
        newModel = newModel.add('phone', phone('tel:111-111-1111', {listed: false}))
        const expectedPatchCalls = [
          [
            listedURI,
            [],
            [`<${webId}> ${vocab.foaf('phone')} "tel:000-000-0000" .`]
          ],
          [
            unlistedURI,
            [],
            [`<${webId}> ${vocab.foaf('phone')} "tel:111-111-1111" .`]
          ]
        ]
        return newModel
          .save(rdf, webClientSpy)
          .catch(err => {
            const updatedModel = err.model
            expectWebCalls(webClientSpy, patchSpy, expectedPatchCalls)
            const addedPhone = updatedModel.get('phone')[2]
            expect(addedPhone.value).toBe('tel:000-000-0000')
            expect(addedPhone.originalQuad(rdf, subject).toString()).toBe(
              `<${webId}> ${vocab.foaf('phone')} "tel:000-000-0000" .`
            )
            const phoneNotPatched = updatedModel.get('phone')[3]
            expect(phoneNotPatched.value).toBe('tel:111-111-1111')
            expect(phoneNotPatched.originalQuad(rdf, subject)).toBe(null)
          })
      })
    })
  })
})
