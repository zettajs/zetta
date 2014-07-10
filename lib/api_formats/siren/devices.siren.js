var rel = require('../../api_rels');

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
  model.update();
  var entity = {
    class: ['device'],
    properties: model.properties,
    links: [{ rel: ['self'], href: env.helpers.url.path(loader.path + '/devices/' + model.id) },
            { rel: ['up', rel.server], href: env.helpers.url.path(loader.path) }]
  };

  return entity;
};
