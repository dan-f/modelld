# modelld
[![NPM Version](https://img.shields.io/npm/v/modelld.svg?style=flat)](https://npm.im/modelld)
[![Build Status](https://travis-ci.org/dan-f/modelld.svg)](https://travis-ci.org/dan-f/modelld)
[![Coverage Status](https://coveralls.io/repos/github/dan-f/modelld/badge.svg?branch=master)](https://coveralls.io/github/dan-f/modelld?branch=master)

A JavaScript API for selecting and manipulating subgraphs of linked data.

This is a work in progress!  The API will definitely change.

## About

`modelld` is a library which helps you build apps on top linked data.  It
provides a higher-level interface for graph manipulation than you'd get using
something like [rdf-ext](https://github.com/rdf-ext/rdf-ext) or
[rdflib.js](https://github.com/linkeddata/rdflib.js/) out of the box.  It also
makes it easy to save graphs back to LDP services even if your models are made
up of data from several different URIs.

`modelld` makes working with linked data easier by providing developers with an
API for defining their own schemas on top of graphs of data.  It's sort of like
an ORM but for linked data.

## Roadmap

`modelld` is a work in progress.  Don't depend on it for anything.

Here are the things that I'm either actively working on, or that should be
worked on in the near future:

- Determine an architecture for handling multiple RDF libraries
  - RDF JS task force API?
  - Dependency injection?
- Support all RDF types

## Example

Here's how you might use `modelld` to model part of a
[Solid user profile](https://github.com/solid/solid-spec/blob/master/solid-webid-profiles.md):

```javascript
import { fieldFactory, modelFactory } from 'modelld'

// Describes the default 'listed' (public) and 'unlisted' (private) URIs for the
// model as well as which URIs (default and non-default) are considered
// listed/unlisted.
const sourceConfig = {
  defaultSources: {
    listed: 'https://...',
    unlisted: 'https://...'
  },
  sourceIndex: {
    'https://...': true,
    'https://...': true,
    'https://...': false,
    'https://...': false
  }
}

const field = fieldFactory(sourceConfig)
const name = field('http://xmlns.com/foaf/0.1/name')
const picture = field('http://xmlns.com/foaf/0.1/img')
const phone = field('http://xmlns.com/foaf/0.1/phone')


// Suppose you've got an RDF lib named 'rdf'
const profileModel = modelFactory(rdf, {
  name,
  picture,
  phone
})

const webId = 'https://me.databox.me/profile/card#me'
// Suppose you've got an RDF graph named 'graph'
const profile = profileModel(graph, webId)

// Get the value of some fields
profile.any('phone') // => 'tel:000-000-0000'
profile.get('phone') // => ['tel:000-000-0000', 'tel:111-111-1111']
profile.fields('phone') // => [Field('tel:000-000-0000'), Field('tel:111-111-1111')]
// Undeclared fields don't show up
profile.any('undeclared-field') // => undefined
profile.get('undeclared-field') // => []
profile.fields('undeclared-field') // => []

// Add a field.  Models are immutable, so adding/setting/removing fields always
// returns a new model.
const newProfile = profile.add('phone', phone('tel:123-456-7890'))
profile.get('phone') // => ['tel:000-000-0000', 'tel:111-111-1111']
newProfile.get('phone') // => ['tel:000-000-0000', 'tel:111-111-1111', 'tel:123-456-7890']

// Remove a field
const myName = profile.fields('name')[0]
profile
  .remove(myName)
  .any('name') // => undefined

// Update a field's value
const name = profile.fields('name')[0]
profile
  .set(name, {value: 'Daniel'})
  .any('name') // => 'Daniel'

// Save a model back to the LDP server(s) it came from
// (Assume 'web' is the LDP web client, currently assumed to be https://github.com/solid/solid-web-client)
const name = profile.fields('name')[0]
profile
  .set(name, {value: 'Daniel'})
  .add('phone', phone('tel:123-456-7890'))
  .save(rdf, web)
  .then(newModel => {
    console.log(newModel.get('name'))
    console.log(newModel.get('phone'))
  })
  .catch(err => {
    // err.model is the model including all the updates which worked
    // err.diffMap describes the RDF statements which should have been inserted and removed from the server
    // err.failedURIs describes the URIs for which the PATCH requests failed
  })
```

## Installing

```sh
$ npm install --save modelld
```
