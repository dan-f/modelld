/* global beforeEach, describe, it */
import expect from 'expect'
import rdf from 'rdflib'
import { spy } from 'sinon'
import solidNs from 'solid-namespace'

import { modelFactory } from '../src/model'

const vocab = solidNs(rdf)

describe('Model', () => {
  // Constants available for use within describe() blocks
  const profileURI = 'http://mr-cool.example.com/profile/card'
  const webId = `${profileURI}#me`

  // These are dynamically set in beforeEach meaning they're only available
  // within it() blocks.
  let subject
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
    subject = rdf.NamedNode.fromValue(webId)
    const graph = rdf.graph()
    rdf.parse(profile, graph, profileURI, 'text/turtle')

    const profileModel = modelFactory(rdf, {
      age: vocab.foaf('age'),
      name: vocab.foaf('name'),
      phone: vocab.foaf('phone'),
      prefs: vocab.pim('preferencesFile')
    })
    model = profileModel(graph, profileURI, webId)
  })

  it('can get fields by name', () => {
    const nameFields = model.fields('name')
    const nameField = nameFields[0]
    const phoneFields = model.fields('phone')
    expect(nameFields.length).toEqual(1)
    expect(nameField.value).toEqual('Mr. Cool')
    expect(phoneFields.length).toEqual(2)
    expect(phoneFields.map(field => field.value))
      .toEqual(['tel:123-456-7890', 'tel:098-765-4321'])
  })

  it('can get field values by name', () => {
    expect(model.get('phone')).toEqual(['tel:123-456-7890', 'tel:098-765-4321'])
    expect(model.get('unknown-field')).toEqual([])
  })

  it('can get one field value by name', () => {
    expect(model.any('phone')).toEqual('tel:123-456-7890')
    expect(model.any('unknown-field')).toBe(undefined)
  })

  it('returns an empty array for undefined field names', () => {
    expect(model.fields('undefined-field')).toEqual([])
  })

  it('can add new fields', () => {
    const newModel = model.add('name', 'Ms. Cool')
    expect(newModel.get('name')).toEqual(['Mr. Cool', 'Ms. Cool'])
  })

  it('can remove existing fields', () => {
    const firstPhone = model.fields('phone')[0]
    const secondPhone = model.fields('phone')[1]
    const updatedModel = model.remove(firstPhone)
    expect(updatedModel.fields('phone')).toEqual([secondPhone])
  })

  it('can not remove fields which do not belong to the model', () => {
    const notOwnedPhone = model.fieldCreators['phone']('tel:444-444-4444', profileURI)
    expect(model.remove(notOwnedPhone)).toEqual(model)
  })

  it('can change the value of contained fields', () => {
    const [firstPhone, secondPhone] = model.fields('phone')
    const updatedModel = model.set(firstPhone, 'tel:000-000-0000')
    const phones = updatedModel.fields('phone')
    expect(phones.length).toBe(2)
    expect(phones[0].quad).toEqual(firstPhone.quad)
    expect(phones[0].value).toEqual('tel:000-000-0000')
    expect(phones[1]).toEqual(secondPhone)
  })

  it('can change the value of a field by key', () => {
    expect(model.setAny('name', 'New Name').any('name')).toEqual('New Name')
    expect(model.setAny('phone', 'tel:000-000-0000').any('phone')).toEqual('tel:000-000-0000')
    expect(model.any('age')).toBe(undefined)
    expect(model.setAny('age', '24').any('age')).toEqual('24')
  })

  it('can change the value of a field to a NamedNode', () => {
    const newPrefs = 'https://example.com/me/storage/'
    const updatedModel = model.setAny('prefs', newPrefs, {namedNode: true})
    const subject = rdf.NamedNode.fromValue('https://example.com/profile#me')
    expect(updatedModel.fields('prefs')[0].toQuad(rdf, subject).object).toEqual(
      rdf.NamedNode.fromValue('https://example.com/me/storage/')
    )
  })

  describe('diffing', () => {
    describe('for unchanged models', () => {
      it('shows no changes', () => {
        expect(model.diff(rdf)).toEqual({})
      })
    })

    describe('after adding quad-constructed fields', () => {
      const testData = [
        ['familiar', profileURI],
        ['unfamiliar', 'https://unknown-server.com/resource']
      ]
      testData.forEach(([type, source]) => {
        it(`does not add ${type} fields to the diff`, () => {
          const phoneQuad = rdf.quad(
            rdf.NamedNode.fromValue(webId),
            vocab.foaf('phone'),
            rdf.Literal.fromValue('tel:444-444-4444'),
            rdf.NamedNode.fromValue(source)
          )
          expect(model.addQuad(phoneQuad).diff(rdf))
            .toEqual({})
        })
      })
    })

    describe('after adding fields', () => {
      it('shows that a field should be inserted into the graph', () => {
        const value = 'tel:000-000-0000'
        const uri = profileURI
        const updatedModel = model.add('phone', value)
        const expectedDiff = {}
        expectedDiff[uri] = {}
        expectedDiff[uri].toDel = []
        expectedDiff[uri].toIns = [
          rdf.st(
            subject,
            vocab.foaf('phone'),
            rdf.Literal.fromValue(value)
          ).toString()
        ]
        expect(updatedModel.diff(rdf)).toEqual(expectedDiff)
      })
    })

    describe('after removing fields', () => {
      it('shows that a field should be removed from the graph', () => {
        const uri = profileURI
        const removedPhone = model.fields('phone')[1]
        const updatedModel = model.remove(removedPhone)
        const expectedDiff = {}
        expectedDiff[uri] = {}
        expectedDiff[uri].toDel = [
          removedPhone.toQuad(rdf, subject).toString()
        ]
        expectedDiff[uri].toIns = []
        expect(updatedModel.diff(rdf)).toEqual(expectedDiff)
      })
    })

    describe('after updating fields', () => {
      it('shows that a field should be added to and removed from the graph', () => {
        const value = 'tel:000-000-0000'
        const newPhoneURI = profileURI
        const oldPhone = model.fields('phone')[1]
        const oldPhoneURI = profileURI
        const updatedModel = model.set(oldPhone, value)
        const expectedDiff = {}
        expectedDiff[oldPhoneURI] = {toIns: [], toDel: []}
        expectedDiff[newPhoneURI] = {toIns: [], toDel: []}
        expectedDiff[oldPhoneURI].toDel.push(
          `<${webId}> ${vocab.foaf('phone')} <${oldPhone.value}> .`
        )
        expectedDiff[newPhoneURI].toIns.push(
          `<${webId}> ${vocab.foaf('phone')} <${value}> .`
        )
        expect(updatedModel.diff(rdf)).toEqual(expectedDiff)
      })
    })

    it('shows when a field should be moved to a new graph', () => {
      const newGraphUrl = 'https://example.com/other-resource'
      const newModel = model.setAny('name', 'New Name', {
        namedGraph: newGraphUrl
      })
      expect(newModel.fields('name')[0].namedGraph.equals(
        rdf.NamedNode.fromValue(newGraphUrl)
      )).toBe(true)
      expect(newModel.diff(rdf)).toEqual({
        [profileURI]: {
          toDel: [`<${webId}> ${vocab.foaf('name')} "Mr. Cool" .`],
          toIns: []
        },
        [newGraphUrl]: {
          toDel: [],
          toIns: [`<${webId}> ${vocab.foaf('name')} "New Name" .`]
        }
      })
    })
  })

  describe('saving', () => {
    const createFakeWebClient = ({failPatchFor = null} = {}) => {
      const patchSpy = spy((url, toDel, toIns) => {
        return failPatchFor === url
          ? Promise.reject({url})
          : Promise.resolve({url})
      })
      const webClient = {patch: patchSpy}
      return {patchSpy, webClient}
    }

    const expectWebCalls = (webClient, patchSpy, patchCalls) => {
      // Expect that the web client's patch method was properly called
      expect(patchSpy.callCount).toBe(patchCalls.length)
      patchCalls.forEach(call => {
        expect(patchSpy.calledWith(...call)).toBe(true)
      })
    }

    describe('for unchanged models', () => {
      it('should return the current model', () => {
        const {patchSpy, webClient} = createFakeWebClient()
        return model
          .save(rdf, webClient)
          .then(updatedModel => {
            expect(patchSpy.called).toBe(false)
            expect(updatedModel).toEqual(model)
          })
      })
    })

    describe('after adding fields', () => {
      it('should patch the new field\'s URI for a field and return the updated model', () => {
        const value = 'tel:000-000-0000'
        const expectedPatchCalls = [
          [
            profileURI,
            [],
            [`<${webId}> ${vocab.foaf('phone')} "tel:000-000-0000" .`]
          ]
        ]
        const {patchSpy, webClient} = createFakeWebClient()
        return model
          .add('phone', value)
          .save(rdf, webClient)
          .then(newModel => {
            expectWebCalls(webClient, patchSpy, expectedPatchCalls)
            const phones = newModel.fields('phone')
            expect(phones.length).toBe(3)
            // The new field should now be tracking its previously "new" state
            // as its "old" state in the .quad property.
            expect(phones[2].originalObject).toEqual(
              rdf.Literal.fromValue(value)
            )
            expect(phones[2].namedGraph.equals(rdf.NamedNode.fromValue(profileURI))).toBe(true)
            expect(newModel.diff(rdf)).toEqual({})
          })
      })
    })

    describe('after removing fields', () => {
      it('should patch the removed field\'s URI and return the updated model', () => {
        const {patchSpy, webClient} = createFakeWebClient()
        const removedPhone = model.fields('phone')[1]
        const uri = profileURI
        return model
          .remove(removedPhone)
          .save(rdf, webClient)
          .then(newModel => {
            expectWebCalls(webClient, patchSpy, [
              [
                uri,
                [removedPhone.toQuad(rdf, subject).toString()],
                []
              ]
            ])
            const phones = newModel.fields('phone')
            expect(phones.length).toBe(1)
            expect(newModel.diff(rdf)).toEqual({})
          })
      })
    })

    describe('after updating fields', () => {
      it('should patch the new and removed field URIs for a field and update the model', () => {
        const value = 'tel:000-000-0000'
        const expectedPatchCalls = [
          [
            profileURI,
            // Assume that we are updating the second phone number in the
            // profile.
            [`<${webId}> ${vocab.foaf('phone')} <tel:098-765-4321> .`],
            [`<${webId}> ${vocab.foaf('phone')} <tel:000-000-0000> .`]
          ]
        ]
        const {patchSpy, webClient} = createFakeWebClient()
        const removedPhone = model.fields('phone')[1]
        const updatedModel = model.set(removedPhone, value)
        return updatedModel
          .save(rdf, webClient)
          .then(newModel => {
            expectWebCalls(webClient, patchSpy, expectedPatchCalls)
            expect(newModel.fields('phone').length).toBe(2)
            expect(newModel.diff(rdf)).toEqual({})
          })
      })
    })

    describe('after a failed patch', () => {
      it('should return a model with updated fields for only those which were successfully updated', () => {
        const successfulURI = profileURI
        const unsuccessfulURI = 'https://example.com/resource-will-fail-to-patch'
        const {patchSpy, webClient} = createFakeWebClient({failPatchFor: unsuccessfulURI})
        let newModel = model.add('phone', 'tel:000-000-0000', {namedGraph: successfulURI})
        newModel = newModel.add('phone', 'tel:111-111-1111', {namedGraph: unsuccessfulURI})
        const expectedPatchCalls = [
          [
            successfulURI,
            [],
            [`<${webId}> ${vocab.foaf('phone')} "tel:000-000-0000" .`]
          ],
          [
            unsuccessfulURI,
            [],
            [`<${webId}> ${vocab.foaf('phone')} "tel:111-111-1111" .`]
          ]
        ]
        return newModel
          .save(rdf, webClient)
          .catch(err => {
            const updatedModel = err.model
            expectWebCalls(webClient, patchSpy, expectedPatchCalls)
            const addedPhone = updatedModel.fields('phone')[2]
            expect(addedPhone.value).toBe('tel:000-000-0000')
            expect(addedPhone.originalQuad(rdf, subject).toString()).toBe(
              `<${webId}> ${vocab.foaf('phone')} "tel:000-000-0000" .`
            )
            const phoneNotPatched = updatedModel.fields('phone')[3]
            expect(phoneNotPatched.value).toBe('tel:111-111-1111')
            expect(phoneNotPatched.originalQuad(rdf, subject)).toBe(null)
            // Verify useful data was properly stored on the error
            expect(err.diffMap).toEqual(newModel.diff(rdf))
            expect(err.failedURIs).toEqual(new Set([unsuccessfulURI]))
          })
      })
    })
  })
})
