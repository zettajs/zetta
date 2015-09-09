var url = require('url');
var rel = require('zetta-rels');

module.exports = function(context) {
  var loader = context.loader;
  var env = context.env;
  var model = context.model;
  var actions = buildActions(model.id, env, loader, model.transitionsAvailable());
  var streams = buildStreamLinks(model, loader, env);
  var properties = model.properties();
  var entity = {
    class: ['device', properties.type],
    properties: properties,
    actions: actions,
    links: [{ rel: ['self', 'edit'], href: env.helpers.url.path(loader.path + '/devices/' + model.id) },
            { title: context.serverName, rel: ['up', rel.server], href: env.helpers.url.path(loader.path) },
            { rel: [rel.type, 'describedby'], href: env.helpers.url.path(loader.path) + '/meta/' + properties.type }]
  };

  entity.links = entity.links.concat(streams);
  return entity;
};

var buildActions = module.exports.buildActions = function(deviceId, env, loader, transitions) {
  var actions = null;
  Object.keys(transitions).forEach(function(type) {
    var transition = transitions[type];
    var fields = transition.fields ? [].concat(transition.fields) : [];
    fields.push({ name: 'action', type: 'hidden', value: type });

    var action = {
      class: ['transition'],
      name: type,
      method: 'POST',
      href: env.helpers.url.path(loader.path + '/devices/' + deviceId),
      fields: fields
    };
    if (!actions) {
      actions = [];
    }

    actions.push(action);
  });

  return actions;
};

var buildStreamLinks = function(model, loader, env) {
  var links = [];
  var rootPath = env.helpers.url.path(loader.path);
  var isForwardedProtocol = env.request && env.request.headers.hasOwnProperty('x-forwarded-proto') &&
    ['http', 'https'].indexOf(env.request.headers['x-forwarded-proto']) !== -1;
  var isSpdy = env.request && !!env.request.isSpdy && !isForwardedProtocol;
  var eventPath = isSpdy ? rootPath + '/events' : rootPath.replace(/^http/, 'ws') + '/events';

  var streams = model._streams;
  streams.logs = { enabled: true }; // add logs to links
  Object.keys(streams).forEach(function(name) {
    var q = { topic: model.type + '/' + model.id + '/' + name };
    var streamRel = rel.objectStream;
    if (streams[name]._writableState && !streams[name]._writableState.objectMode) {
      streamRel = rel.binaryStream;
    }
    var stream = {
      title: name,
      rel: ['monitor', streamRel],
      href: eventPath + url.format({ query: q})
    };
    if(streams[name].enabled) {
      links.push(stream);
    }
  });

  return links;

};
