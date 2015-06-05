var path = require('path');
var rel = require('zetta-rels');

module.exports = function(context) {
  var server = context.server;
  var types = context.types;
  var loader = context.loader;
  var env = context.env;

  var entity = {
    class: ['metadata'],
    properties: server.getProperties(),
    entities: [],
    links: [
      { rel: ['self'], href: env.helpers.url.current() },
      { rel: [rel.server], href: env.helpers.url.path(loader.path) },
      { rel: ['monitor'], href: env.helpers.url.path(loader.path).replace(/^http/, 'ws') + '/events?topic=meta' }
    ]
  };

  types.forEach(function(type) {
    var e = {
      class: ['type'],
      rel: [rel.type, 'item'],
      properties: {},
      links: [
        { rel: ['self'], href: env.helpers.url.path(loader.path) + '/meta/' + encodeURIComponent(type.type) }
      ]
    };

    Object.keys(type).forEach(function(key) {
      e.properties[key] = type[key];
    });

    entity.entities.push(e);
  });

  return entity;
};
