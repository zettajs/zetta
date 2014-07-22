var rel = require('../../api_rels');
var device_format = require('./device.siren');

module.exports = function(context) {
  var server = context.server;
  var devices = context.devices;
  var loader = context.loader;
  var env = context.env;

  var entity = {
    class: ['server'],
    properties: {
      id: server.id,
      name: server._name
    },
    actions: [
      {
        name: 'register-device',
        method: 'POST',
        href: env.helpers.url.path('/servers/' + server.id + '/devices'),
        type: 'application/x-www-form-urlencoded',
        fields: [
          {
            name: 'type',
            type: 'text'
          },
          {
            name: 'id',
            type: 'text'
          },
          {
            name: 'name',
            type: 'text'
          }
        ]
      }
    ],
    links: [
      { rel: ['self'], href: env.helpers.url.current() },
      { rel: ['monitor'], href: env.helpers.url.path('/servers/' + server.id + '/logs') }
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
