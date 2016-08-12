# ld-lens

A JavaScript API for selecting and manipulating subgraphs of linked data.

This is a work in progress!  The API will definitely change.

## About

Linked data is richly expressive, but graphs can be difficult to query and
modify programmatically when building applications.  Graphs are often composed
of many subgraphs coming from different domains.  Often the developer only cares
about a particular subset of the graph's data, but that subset may not be coming
from the same source.

`ld-lens` makes working with linkeddata easier by providing developers with an
API for defining their own schemas on top of graphs of data.  It does so by
implementing familiar concepts - models and fields.

## Roadmap

`ld-lens` is a work in progress.  Don't depend on it for anything.

Here are the things that I'm either actively working on, or that should be
worked on in the near future:

- Persist a model's state on the server through SPARQL Update
- Determine an architecture for handling multiple RDF libraries
  - RDF JS task force API?
  - Dependency injection?
- Support all RDF types

## Example

TODO

## Installing

TODO
