/* global describe, it */
import expect from 'expect'
import rdf from 'rdflib'
import solidNs from 'solid-namespace'

import { fieldFactory, Field } from '../src/field'

const vocab = solidNs(rdf)

describe('Field', () => {
  const namedGraph = 'https://example.com/resource'
  const name = fieldFactory(vocab.foaf('name'))
  const age = fieldFactory(vocab.foaf('age'))
  const hasRead = fieldFactory(rdf.NamedNode.fromValue('http://www.w3.org/ns/solid/terms#read'))
  const date = fieldFactory(rdf.NamedNode.fromValue('http://purl.org/dc/terms/date'))

  describe('raw constructor', () => {
    it('requires a predicate, source config, and either a value or an originalObject', () => {
      const predicate = vocab.foaf('name')
      // Insufficient arguments
      expect(() => new Field()).toThrow(Error)
      expect(() => new Field({})).toThrow(Error)
      expect(() => new Field({predicate})).toThrow(Error)
      // Sufficient arguments
      expect(() => new Field({predicate, namedGraph, value: 'dan'}))
        .toNotThrow()
      expect(() =>
        new Field({
          predicate,
          originalNamedGraph: namedGraph,
          originalObject:
          rdf.Literal.fromValue('dan')
        })
      ).toNotThrow()
    })
  })

  it('has a value', () => {
    expect(name('dan', namedGraph).value).toEqual('dan')
  })

  it('can track the original RDF object property', () => {
    const originalQuad = rdf.quad(
      rdf.NamedNode.fromValue('https://example.com/profile#me'),
      vocab.foaf('name'),
      rdf.Literal.fromValue('dan')
    )
    const originalName = name.fromQuad(originalQuad)
    expect(originalName.value).toEqual('dan')
  })

  it('can update its value', () => {
    const firstName = name('dan', namedGraph)
    expect(firstName.value).toEqual('dan')
    expect(firstName.set({value: 'dmitri'}).value).toEqual('dmitri')
  })

  it('cannot directly mutate its value', () => {
    expect(() => { name('dan', namedGraph).value = 'foo' })
      .toThrow(TypeError)
  })

  it('can create a new field from its current state', () => {
    const quad = rdf.quad(
      rdf.NamedNode.fromValue('https://example.com/profile#me'),
      vocab.foaf('name'),
      rdf.Literal.fromValue('dan'),
      rdf.NamedNode.fromValue(namedGraph)
    )
    const newNamedGraph = rdf.NamedNode.fromValue('https://example.com/other-resource')
    const field = name.fromQuad(quad)
    const updatedField = field.set({value: 'bob', namedGraph: newNamedGraph})
    const fieldTrackingCurrentState = updatedField.fromCurrentState(rdf, quad.subject)
    expect(fieldTrackingCurrentState.originalObject).toEqual(
      rdf.Literal.fromValue('bob')
    )
    expect(fieldTrackingCurrentState.namedGraph).toEqual(newNamedGraph)
  })

  describe('originalQuad', () => {
    it('returns the original quad that the field represents', () => {
      const quad = rdf.quad(
        rdf.NamedNode.fromValue('https://example.com/profile#me'),
        vocab.foaf('name'),
        rdf.Literal.fromValue('dan'),
        rdf.NamedNode.fromValue(namedGraph)
      )
      expect(name.fromQuad(quad).originalQuad(rdf, quad.subject)).toEqual(quad)
    })

    it('returns a quad with no graph URI for quads without a source', () => {
      const quad = rdf.quad(
        rdf.NamedNode.fromValue('https://example.com/profile#me'),
        vocab.foaf('name'),
        rdf.Literal.fromValue('dan')
      )
      expect(name.fromQuad(quad).originalQuad(rdf, quad.subject)).toEqual(
        rdf.quad(
          rdf.NamedNode.fromValue('https://example.com/profile#me'),
          vocab.foaf('name'),
          rdf.Literal.fromValue('dan')
        )
      )
    })

    it('returns null for fields which do not track an original quad', () => {
      expect(name('dan', namedGraph).originalQuad(rdf, rdf.NamedNode.fromValue('https://example.com/profile#me'))).toBe(null)
    })
  })

  describe('toQuad', () => {
    describe('for unfamiliar sources', () => {
      it('returns the original quad for a quad-constructed field', () => {
        const quad = rdf.quad(
          rdf.NamedNode.fromValue('https://example.com/profile#me'),
          vocab.foaf('name'),
          rdf.Literal.fromValue('dan'),
          rdf.NamedNode.fromValue('https://unknown-server.com/resource')
        )
        expect(name.fromQuad(quad).toQuad(rdf, quad.subject)).toEqual(quad)
      })
    })

    it('returns the original quad for a quad-constructed field', () => {
      const quad = rdf.quad(
        rdf.NamedNode.fromValue('https://example.com/profile#me'),
        vocab.foaf('name'),
        rdf.Literal.fromValue('dan'),
        rdf.NamedNode.fromValue(namedGraph)
      )
      expect(name.fromQuad(quad).toQuad(rdf, quad.subject)).toEqual(quad)
    })

    it('returns appropriate subject, predicate, value, and graph for value-constructed fields', () => {
      expect(name('dan', namedGraph).toQuad(rdf, rdf.NamedNode.fromValue('https://example.com/profile#me')))
        .toEqual(
          rdf.quad(
            rdf.NamedNode.fromValue('https://example.com/profile#me'),
            vocab.foaf('name'),
            rdf.Literal.fromValue('dan'),
            rdf.NamedNode.fromValue(namedGraph)
          )
        )
      expect(name('dan', namedGraph).toQuad(rdf, rdf.NamedNode.fromValue('https://example.com/profile#me')))
        .toEqual(
          rdf.quad(
            rdf.NamedNode.fromValue('https://example.com/profile#me'),
            vocab.foaf('name'),
            rdf.Literal.fromValue('dan'),
            rdf.NamedNode.fromValue(namedGraph)
          )
        )
    })

    it('constructs a namedNode when the field is specified as a NamedNode', () => {
      const storage = fieldFactory(vocab.pim('storage'))
      const storageField = storage('https://example.databox.me/storage/', namedGraph, {namedNode: true})
      expect(storageField.toQuad(rdf, rdf.NamedNode.fromValue('https://example.com/storage#this')))
        .toEqual(
          rdf.quad(
            rdf.NamedNode.fromValue('https://example.com/storage#this'),
            vocab.pim('storage'),
            rdf.NamedNode.fromValue('https://example.databox.me/storage/'),
            rdf.NamedNode.fromValue(namedGraph)
          )
        )
    })
  })

  describe('converting between RDF and JS values/types', () => {
    it('converts booleans both ways', () => {
      const subject = rdf.NamedNode.fromValue('https://example.com/profile#me')
      const predicate = rdf.NamedNode.fromValue('http://www.w3.org/ns/solid/terms#read')
      const originalResource = rdf.NamedNode.fromValue(
        'https://example.com/other-resource'
      )
      const quad = rdf.quad(
        subject,
        predicate,
        rdf.Literal.fromValue(true),
        originalResource
      )
      const trueField = hasRead.fromQuad(quad)
      expect(trueField.value).toBe(true)
      expect(trueField.toQuad(rdf, subject)).toEqual(quad)
      const falseField = trueField.set({value: false})
      expect(falseField.value).toBe(false)
      expect(falseField.toQuad(rdf, subject))
        .toEqual(
          rdf.quad(
            subject,
            predicate,
            rdf.Literal.fromValue(false),
            originalResource
          )
        )
    })

    describe('numeric types', () => {
      const data = [
        {type: 'integers', firstVal: 24, nextVal: 25},
        {type: 'doubles', firstVal: 0.5, nextVal: 1.5}
      ]
      data.forEach(({type, firstVal, nextVal}) => {
        it(`converts ${type} both ways`, () => {
          const subject = rdf.NamedNode.fromValue('https://example.com/profile#me')
          const originalResource = rdf.NamedNode.fromValue(
            'https://example.com/another-private-resource'
          )
          const quad = rdf.quad(
            subject,
            vocab.foaf('age'),
            rdf.Literal.fromValue(firstVal),
            originalResource
          )
          const firstField = age.fromQuad(quad)
          expect(firstField.value).toBe(firstVal)
          expect(firstField.toQuad(rdf, subject)).toEqual(quad)
          const newField = firstField.set({value: nextVal})
          expect(newField.value).toBe(nextVal)
          expect(newField.toQuad(rdf, subject))
            .toEqual(
              rdf.quad(
                subject,
                vocab.foaf('age'),
                rdf.Literal.fromValue(nextVal),
                originalResource
              )
            )
        })
      })
    })

    it('converts datetimes both ways', () => {
      const subject = rdf.NamedNode.fromValue('https://example.com/profile#me')
      const predicate = rdf.NamedNode.fromValue('http://purl.org/dc/terms/date')
      const originalResource = rdf.NamedNode.fromValue(
        'https://example.com/another-private-resource'
      )
      const d = new Date('2016-1-1')
      const quad = rdf.quad(
        subject,
        predicate,
        rdf.Literal.fromValue(d),
        originalResource
      )
      const firstField = date.fromQuad(quad)
      expect(firstField.value.toString()).toBe(d.toString())
      expect(firstField.toQuad(rdf, subject)).toEqual(quad)
      const d2 = new Date('2020-1-1')
      const newField = firstField.set({value: d2})
      expect(newField.value.toString()).toBe(d2.toString())
      expect(newField.toQuad(rdf, subject))
        .toEqual(
          rdf.quad(
            subject,
            predicate,
            rdf.Literal.fromValue(d2),
            originalResource
          )
        )
    })

    it('rejects values that are mis-matched with their type', () => {
      const subject = rdf.NamedNode.fromValue('https://example.com/profile#me')
      const predicate = rdf.NamedNode.fromValue('http://www.w3.org/ns/solid/terms#read')
      const datatype = rdf.NamedNode.fromValue('http://www.w3.org/2001/XMLSchema#boolean')
      const object = new rdf.Literal('foo', null, datatype)
      const quad = rdf.quad(subject, predicate, object)
      expect(() => {
        hasRead.fromQuad(quad)
      }).toThrow(/Cannot parse/)
    })

    it('parses unknown datatypes as strings', () => {
      const object = new rdf.Literal(
        'foo', null, rdf.NamedNode.fromValue('https://example.com/datatypes#unknown')
      )
      const quad = rdf.quad(
        rdf.NamedNode.fromValue('https://example.com/profile/#me'),
        vocab.foaf('name'),
        object
      )
      const field = name.fromQuad(quad)
      expect(field.value).toBe('foo')
    })
  })
})
