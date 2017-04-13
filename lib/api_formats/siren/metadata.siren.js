const path = require('path');
const rel = require('zetta-rels');

module.exports = context => {
  const server = context.server;
  const types = context.types;
  const loader = context.loader;
  const env = context.env;
  const isSpdy = !!context.env.request.isSpdy;
  const rootPath = env.helpers.url.path(loader.path);
  const eventPath = `${isSpdy ? rootPath + '/events' : rootPath.replace(/^http/, 'ws')}/events`;

  const entity = {
    class: ['metadata'],
    properties: server.getProperties(),
    entities: [],
    links: [
      { rel: ['self'], href: env.helpers.url.current() },
      { rel: [rel.server], href: env.helpers.url.path(loader.path) },
      { rel: ['monitor'], href: `${eventPath}?topic=meta` }
    ]
  };

  types.forEach(type => {
    const e = {
      class: ['type'],
      rel: [rel.type, 'item'],
      properties: {},
      links: [
        { rel: ['self'], href: `${rootPath}/meta/${encodeURIComponent(type.type)}` }
      ]
    };

    Object.keys(type).forEach(key => {
      e.properties[key] = type[key];
    });

    entity.entities.push(e);
  });

  return entity;
};
