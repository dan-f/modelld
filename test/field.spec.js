/* global describe, it */
import expect from 'expect'
import rdf from 'rdflib'
import solidNs from 'solid-namespace'

import * as Field from '../src/field'

const vocab = solidNs(rdf)

describe('Field', () => {
  const defaultSources = {
    listed: 'https://example.com/public-resource',
    unlisted: 'https://example.com/private-resource'
  }
  const sourceIndex = {
    'https://example.com/public-resource': true,
    'https://example.com/another-public-resource': true,
    'https://example.com/private-resource': false,
    'https://example.com/another-private-resource': false
  }
  const sourceConfig = {
    defaultSources,
    sourceIndex
  }
  const factory = Field.fieldFactory(sourceConfig)
  const name = factory(vocab.foaf('name'))

  it('has a value', () => {
    expect(name('dan').value).toEqual('dan')
  })

  it('can track the original RDF quad', () => {
    const originalQuad = rdf.quad(
      rdf.sym('#me'),
      vocab.foaf('name'),
      rdf.Literal.fromValue('dan')
    )
    const originalName = name.fromQuad(originalQuad)
    expect(originalName.value).toEqual('dan')
  })

  it('can be listed or unlisted when created by value', () => {
    expect(name('dan').listed).toBe(false)
    expect(name('dan', {listed: true}).listed).toBe(true)
    expect(name('dan', {listed: false}).listed).toBe(false)
  })

  it('can be listed or unlisted when created from an RDF quad', () => {
    const listedQuad = rdf.quad(
      rdf.sym('#me'),
      vocab.foaf('name'),
      rdf.Literal.fromValue('dan'),
      rdf.sym('https://example.com/public-resource')
    )
    const unlistedQuad = rdf.quad(
      rdf.sym('me'),
      vocab.foaf('name'),
      rdf.sym('dan'),
      rdf.sym('https://example.com/private-resource')
    )
    const unspecifiedQuad = rdf.quad(
      rdf.sym('#me'),
      vocab.foaf('name'),
      rdf.Literal.fromValue('dan')
    )
    expect(name.fromQuad(listedQuad).listed).toBe(true)
    expect(name.fromQuad(unlistedQuad).listed).toBe(false)
    expect(name.fromQuad(unspecifiedQuad).listed).toBe(false)
  })

  it('can update its value', () => {
    const firstName = name('dan')
    expect(firstName.value).toEqual('dan')
    expect(Field.set(firstName, {value: 'dmitri'}).value).toEqual('dmitri')
  })

  it('cannot directly mutate its value', () => {
    expect(() => { name('dan').value = 'foo' })
      .toThrow('Fields are immutable.  Use Field.set() to create new fields with different values.')
  })

  it('can update its listed value', () => {
    const firstName = name('dan')
    expect(firstName.listed).toBe(false)
    expect(Field.set(firstName, {listed: true}).listed).toBe(true)
  })

  it('cannot directly mutate its listed value', () => {
    expect(() => { name('dan').listed = false })
      .toThrow('Fields are immutable.  Use Field.set() to create new fields with different values.')
  })

  it('can toggle its listed value', () => {
    const firstName = name('dan', {listed: true})
    const privateFirstName = Field.toggleListed(firstName)
    const publicFirstName = Field.toggleListed(privateFirstName)
    expect(privateFirstName.listed).toBe(false)
    expect(publicFirstName.listed).toBe(true)
  })

  describe('RDF statement generation', () => {
    it('returns the original quad for a quad-constructed field', () => {
      const quad = rdf.quad(
        rdf.sym('#me'),
        vocab.foaf('name'),
        rdf.Literal.fromValue('dan'),
        rdf.sym(defaultSources.listed)
      )
      expect(Field.toQuad(rdf, quad.subject, name.fromQuad(quad))).toEqual(quad)
    })

    it('returns appropriate subject, predicate, value, and graph for value-constructed fields', () => {
      expect(Field.toQuad(rdf, rdf.sym('#me'), name('dan', {listed: true})))
        .toEqual(
          rdf.quad(
            rdf.sym('#me'),
            vocab.foaf('name'),
            rdf.Literal.fromValue('dan'),
            rdf.sym(defaultSources.listed)
          )
        )
      expect(Field.toQuad(rdf, rdf.sym('#me'), name('dan', {listed: false})))
        .toEqual(
          rdf.quad(
            rdf.sym('#me'),
            vocab.foaf('name'),
            rdf.Literal.fromValue('dan'),
            rdf.sym(defaultSources.unlisted)
          )
        )
    })

    it('remembers which resource it came from', () => {
      // When an unlisted field gets toggled as listed and then toggled as
      // unlisted once again, it should remember which unlisted resource it
      // originally came from; it should not end up on the default unlisted
      // resource.
      const originalResource = rdf.sym(
        'https://example.com/another-private-resource'
      )
      const quad = rdf.quad(
        rdf.sym('#me'),
        vocab.foaf('name'),
        rdf.Literal.fromValue('dan'),
        originalResource
      )
      const firstName = name.fromQuad(quad)
      const listedFirstName = Field.toggleListed(firstName)
      const unlistedFirstName = Field.toggleListed(listedFirstName)
      expect(firstName.listed).toBe(false)
      // Expect the initial non-default unlisted graph
      expect(Field.toQuad(rdf, quad.subject, firstName).graph)
        .toEqual(quad.graph)
      expect(listedFirstName.listed).toBe(true)
      // Expect the default listed graph
      expect(Field.toQuad(rdf, quad.subject, listedFirstName).graph)
        .toEqual(rdf.sym(defaultSources.listed))
      expect(unlistedFirstName.listed).toBe(false)
      // Expect the initial non-default unlisted graph
      expect(Field.toQuad(rdf, quad.subject, unlistedFirstName).graph)
        .toEqual(quad.graph)
    })
  })
})
