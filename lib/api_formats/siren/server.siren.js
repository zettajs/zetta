var rel = require('zetta-rels');
var device_format = require('./device.siren');
var qs = require('querystring');

module.exports = function(context) {
  var server = context.server;
  var devices = context.devices;
  var loader = context.loader;
  var env = context.env;

  var entity = {
    class: ['server'],
    properties: {
      name: server._name
    },
    actions: [
      {
        name: 'register-device',
        method: 'POST',
        href: env.helpers.url.path(loader.path + '/devices'),
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
      },
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
      { rel: ['monitor'], href: env.helpers.url.path(loader.path).replace(/^http/, 'ws') + '/events?topic=logs' }
    ]
  };

  entity.entities = [];
  Object.keys(devices).forEach(function(device) {
      entity.entities.push(buildEntity(devices[device], server, loader, env));
  });
  if(context.query) {
    entity.properties.ql = context.query;
    entity.class = entity.class.concat(context.classes);
    var queryTopic = qs.stringify({topic: 'query/'+context.query, since: new Date().getTime()});
    entity.links.push({ rel: [rel.query], href: env.helpers.url.path(loader.path + '/events').replace(/^http/, 'ws') + '?' + queryTopic });
    //rerform matching of current devices.
  }

  return entity;
};

var buildEntity = function(model, server, loader, env) {
  var self = this;
  var properties = model.properties();
  var entity = {
    class: ['device', properties.type],
    rel: [rel.device],
    properties: properties,
    links: [{ rel: ['self'], href: env.helpers.url.path(loader.path + '/devices/' + model.id) },
            { title: server._name, rel: ['up', rel.server], href: env.helpers.url.path(loader.path) }]
  };

  return entity;
};
