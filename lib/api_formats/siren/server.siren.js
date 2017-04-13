const rel = require('zetta-rels');
const qs = require('querystring');

module.exports = function(context) {
  const server = context.server;
  const devices = context.devices;
  const loader = context.loader;
  const env = context.env;

  const isForwardedProtocol = context.env.request.headers.hasOwnProperty('x-forwarded-proto') &&
    ['http', 'https'].indexOf(context.env.request.headers['x-forwarded-proto']) !== -1;
  const isSpdy = !!context.env.request.isSpdy && !isForwardedProtocol;

  const rootPath = env.helpers.url.path(loader.path);
  const eventPath = isSpdy ? `${rootPath}/events` : `${rootPath.replace(/^http/, 'ws')}/events`;

  const entity = {
    class: ['server'],
    properties: server.getProperties(),
    entities: [],
    actions: [
      {
        name: 'query-devices',
        method: 'GET',
        href: env.helpers.url.current(),
        type: 'application/x-www-form-urlencoded',
        fields: [
          {
            name: 'ql',
            type: 'text'
          }
        ]
      }
    ],
    links: [
      { rel: ['self'], href: env.helpers.url.current() },
      { rel: [rel.metadata], href: `${rootPath}/meta` },
      { rel: ['monitor'], href: `${eventPath}?topic=logs` }
    ]
  };

  Object.keys(devices).forEach(function(device) {
      entity.entities.push(buildEntity(devices[device], server, loader, env));
  });
  if(context.query) {
    entity.properties.ql = context.query;
    entity.class = entity.class.concat(context.classes);
    const queryTopic = qs.stringify({topic: `query/${context.query}`, since: new Date().getTime()});
    entity.links.push({ rel: [rel.query], href: `${eventPath}?${queryTopic}` });
    //rerform matching of current devices.
  }

  return entity;
};

var buildEntity = function(model, server, loader, env) {
  const self = this;
  const properties = model.properties();
  const entity = {
    class: ['device', properties.type],
    rel: [rel.device],
    properties: properties,
    links: [{ rel: ['self', 'edit'], href: env.helpers.url.path(`${loader.path}/devices/${model.id}`) },
            { rel: [rel.type, 'describedby'], href: `${env.helpers.url.path(loader.path)}/meta/${encodeURIComponent(properties.type)}` },
            { title: server._name, rel: ['up', rel.server], href: env.helpers.url.path(loader.path) }]
  };

  return entity;
};
