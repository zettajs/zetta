var rel = require('zetta-rels');

module.exports = function(context) {
  
  var devices = context.devices;
  var loader = context.loader;
  var env = context.env;

  var entity = {
    class: ['devices'],
    links: [
      { rel: ["self"], href: env.helpers.url.path(loader.path)}
    ]
  };

  entity.entities = [];
  Object.keys(devices).forEach(function(device) {
    entity.entities.push(buildEntity(devices[device], loader, env));
  });

  return entity;
};

var buildEntity = function(model, loader, env) {
  var self = this;
  var properties = model.properties();
  var entity = {
    class: ['device', properties.type],
    rel: [rel.device],
    properties: properties,
    links: [{ rel: ['self'], href: env.helpers.url.path(loader.path + '/devices/' + model.id) },
            { rel: [rel.type, 'describedby'], href: env.helpers.url.path(loader.path) + '/meta/' + encodeURIComponent(properties.type) },
            { rel: ['up', rel.server], href: env.helpers.url.path(loader.path) }]
  };

  return entity;
};
