var rel = require('../../api_rels');


module.exports = function(context) {
  var loader = context.loader;
  var env = context.env;
  var model = context.model;
  model.update();
  var actions = buildActions(model, env);
  var streams = buildStreamLinks(model, loader, env);
  var entity = {
    class: ['device'],
    properties: model.properties,
    actions: actions,
    links: [{ rel: ['self'], href: env.helpers.url.path(loader.path + '/devices/' + model.id) },
            { rel: ['up', rel.server], href: env.helpers.url.path(loader.path) }]
  };

  if (entity.actions) {
    entity.actions.forEach(function(action) {
      if (!action.href) {
        action.href = env.helpers.url.current();
      }
    });
    
    entity.actions = entity.actions.filter(function(action) {
      if (action.class && action.class.indexOf('event-subscription') !== -1) {
        return action;
      }

      var allowed = model.allowed[model.state];
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

  Object.keys(model.transitions).forEach(function(type) {
    var transition = model.transitions[type];
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
  var devicePath = env.helpers.url.path(loader.path + '/devices/' + model.id);
  Object.keys(model.streams).forEach(function(name) {
    var stream = {
      title: name,
      rel: ['monitor', rel.objectStream],
      href: devicePath.replace('http', 'ws') + '/' + name
    };
    links.push(stream);
  });

  return links;

};
