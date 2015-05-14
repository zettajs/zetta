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
    links: [{ rel: ['self'], href: env.helpers.url.path(loader.path + '/devices/' + model.id) },
            { title: context.serverName, rel: ['up', rel.server], href: env.helpers.url.path(loader.path) },
            { rel: [rel.type], href: env.helpers.url.path(loader.path) + '/meta/' + properties.type }]
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
  var eventPath = env.helpers.url.path(loader.path + '/events');
  var streams = model._streams;
  streams.logs = {}; // add logs to links
  Object.keys(streams).forEach(function(name) {
    var q = { topic: model.type + '/' + model.id + '/' + name };
    var streamRel = rel.objectStream;
    if (streams[name]._writableState && !streams[name]._writableState.objectMode) {
      streamRel = rel.binaryStream;
    }
    var stream = {
      title: name,
      rel: ['monitor', streamRel],
      href: eventPath.replace('http', 'ws') + url.format({ query: q})
    };
    links.push(stream);
  });

  return links;

};
