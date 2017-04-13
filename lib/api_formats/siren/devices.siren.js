const rel = require('zetta-rels');

module.exports = context => {
  
  const devices = context.devices;
  const loader = context.loader;
  const env = context.env;

  const entity = {
    class: ['devices'],
    links: [
      { rel: ['self'], href: env.helpers.url.path(loader.path)}
    ]
  };

  entity.entities = [];
  Object.keys(devices).forEach(device => {
    entity.entities.push(buildEntity(devices[device], loader, env));
  });

  return entity;
};

var buildEntity = function(model, loader, env) {
  const self = this;
  const properties = model.properties();
  const entity = {
    class: ['device', properties.type],
    rel: [rel.device],
    properties,
    links: [{ rel: ['self', 'edit'], href: env.helpers.url.path(`${loader.path}/devices/${model.id}`) },
            { rel: [rel.type, 'describedby'], href: `${env.helpers.url.path(loader.path)}/meta/${encodeURIComponent(properties.type)}` },
            { rel: ['up', rel.server], href: env.helpers.url.path(loader.path) }]
  };

  return entity;
};
