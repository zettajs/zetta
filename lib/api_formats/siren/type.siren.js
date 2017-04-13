const path = require('path');
const rel = require('zetta-rels');

module.exports = function(context) {
  const server = context.server;
  const type = context.type;
  const loader = context.loader;
  const env = context.env;

  const entity = {
    class: ['type'],
    properties: {},
    links: [
      { rel: ['self'], href: env.helpers.url.current() },
      { title: server._name, rel: ['collection', rel.metadata], href: env.helpers.url.path(loader.path) + '/meta' },
      { rel: [rel.instances, 'describes'], href: env.helpers.url.path(loader.path) + '?ql=' + encodeURIComponent('where type="' + type.type + '"') }
    ]
  };

  Object.keys(type).forEach(function(key) {
    entity.properties[key] = type[key];
  });

  return entity;
};

