var path = require('path');
var rel = require('zetta-rels');

module.exports = function(context) {
  var server = context.server;
  var type = context.type;
  var loader = context.loader;
  var env = context.env;

  var entity = {
    class: ['type'],
    properties: {},
    links: [
      { rel: ['self'], href: env.helpers.url.current() },
      { title: server._name, rel: ['collection', rel.metadata], href: env.helpers.url.path(loader.path) + '/meta' },
      { rel: [rel.instances], href: env.helpers.url.path(loader.path) + '?ql=' + encodeURIComponent('where type="' + type.type + '"') }
    ]
  };

  Object.keys(type).forEach(function(key) {
    entity.properties[key] = type[key];
  });

  return entity;
};

