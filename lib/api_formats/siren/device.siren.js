var url = require('url');
var rel = require('zetta-rels');

module.exports = function(context) {
  var loader = context.loader;
  var env = context.env;
  var model = context.model;
  var actions = buildActions(model, env);
  var streams = buildStreamLinks(model, loader, env);
  var entity = {
    class: ['device'],
    properties: model.properties(),
    actions: actions,
    links: [{ rel: ['self'], href: env.helpers.url.path(loader.path + '/devices/' + model.id) },
            { title: context.serverName, rel: ['up', rel.server], href: env.helpers.url.path(loader.path) }]
  };

  if (entity.actions) {
    entity.actions.forEach(function(action) {
      if (!action.href) {
        action.href = env.helpers.url.path(loader.path + '/devices/' + model.id);
      }
    });

    entity.actions = entity.actions.filter(function(action) {
      if (action.class && action.class.indexOf('event-subscription') !== -1) {
        return action;
      }

      var allowed = model._allowed[model.state];
      if (allowed && allowed.indexOf(action.name) > -1) {
        return action;
      }
    });
  }

  entity.links = entity.links.concat(streams);
  return entity;
};

var buildActions = function(model, env) {
  var actions = null;

  Object.keys(model._transitions).forEach(function(type) {
    var transition = model._transitions[type];
    var fields = transition.fields ? [].concat(transition.fields) : [];
    fields.push({ name: 'action', type: 'hidden', value: type });

    var action = {
      name: type,
      method: 'POST',
      href: null,
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
