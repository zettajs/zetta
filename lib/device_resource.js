var querystring = require('querystring');
var url = require('url');

var buildActions = exports.buildActions = function(env, machine) {
  var actions = null;


  Object.keys(machine.transitions).forEach(function(type) {
    var transition = machine.transitions[type];
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

  machine.streams.forEach(function(name) {
    var fields = [];
    fields.push({ name: 'name', type: 'hidden', value: name });

    var action = {
      class: ['event-subscription'],
      name: name.replace('/', '-') + '-subscribe',
      method: 'subscribe',
      href: env.helpers.url.path('/').replace('http', 'ws') + 'events',
      fields: fields
    };

    if (!actions) {
      actions = [];
    }

    actions.push(action);
  });

  return actions;
};

var buildEntity = exports.buildEntity = function buildEntity(loader, env, machine, actions, selfPath) {
  machine.update();
  selfPath = selfPath || env.helpers.url.current();

  var entity = {
    class: [machine.type],
    properties: machine.properties,
    entities: undefined,
    actions: actions,
    links: [{ rel: ['self'], href: selfPath },
            { rel: ['index'], href: env.helpers.url.path(loader.path) }]
  };

  if (machine._devices.length) {
    entity.entities = machine._devices.filter(function(device) {
      var path = env.helpers.url.join(device.name);

      if (loader.exposed[url.parse(path).path]) {
        return device;
      }
    }).map(function(device) {
      var path = env.helpers.url.join(device.name);
      return buildEntity(env, device, null, path)
    });

  }

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

      var allowed = machine.allowed[machine.state];
      if (allowed && allowed.indexOf(action.name) > -1) {
        return action;
      }
    });
  }

  return entity;
};

exports.create = function(loader) {
  var DeviceResource = function() {
    this.path = loader.path;
  };


  DeviceResource.prototype.init = function(config) {
    config.path(this.path)
      .produces('application/vnd.siren+json')
      .consumes('application/x-www-form-urlencoded')
      .consumes('multipart/form-data')
      .get('/', this.home)
      .get('/{splat: (.*)}', this.show)
      .post('/{splat: (.*)}', this.action)
  };

  DeviceResource.prototype.home = function(env, next) {
    var entity = {
      class: ['server'],
      entities: [],
      links: [ { rel: ['self'], href: env.helpers.url.path(this.path) } ]
    };

    Object.keys(loader.exposed).forEach(function(path) {
      var machine = loader.exposed[path];
      entity.entities.push({
        class: ['machine'],
        rel: ['http://rels.zettajs.io/machine'],
        properties: machine.properties,
        links: [ { rel: ['self'], href: env.helpers.url.path(path) } ]
      })
    });

    entity.entities = entity.entities.sort(function(a,b){
      if(a.properties.name < b.properties.name) {
	return -1;
      } else if(a.properties.name > b.properties.name) {
	return 1;
      } else {
	return 0;
      }
    });

    env.response.body = entity;
    next(env);
  };

  DeviceResource.prototype.show = function(env, next) {
    // match path
    // load machine
    // build representation
    // don't forget subdevices

    var machine = loader.exposed[this.path + '/' + env.route.params.splat];
    if (!machine) {
      // return 404
      env.response.statusCode = 404;
      return next(env);
    }

    var actions = buildActions(env, machine);

    env.response.body = buildEntity(loader, env, machine, actions);
    next(env);
  };

  DeviceResource.prototype.action = function(env, next) {
    var machine = loader.exposed[this.path + '/' + env.route.params.splat];

    if (!machine) {
      env.response.statusCode = 404;
      return next(env);
    }

    var actions = buildActions(env, machine);


    if(env.multiparty){
      //Multiparty doesn't parse things out like the qs module. We have to make it consistent.
      var qsObject = {};
      Object.keys(env.multiparty.fields).forEach(function(key) {
        var value = env.multiparty.fields[key];
        if(value.length > 1) {
          qsObject[key] = value;
        } else {
          qsObject[key] = value[0];
        }
      });

      Object.keys(env.multiparty.files).forEach(function(key) {
  qsObject[key] = env.multiparty.files[key][0];
      });

      return run(qsObject);
    }else{
      env.request.getBody(function(err, body) {
        body = querystring.parse(body.toString());
        return run(body);
      });
    }

    function run(body){

      if (!body.action) {
        env.response.statusCode = 400;
        return next(env);
      }

      var action = actions.filter(function(action) {
        return (action.name === body.action);
      });

      if (!action || !action.length) {
        env.response.statusCode = 400;
        return next(env);
      }

      action = action[0];

      var args = [action.name];

      if (action.fields && action.fields.length) {
        action.fields.forEach(function(field) {
          if (field.name !== 'action') {
            args.push(body[field.name]);
          }
        });
      }

      var cb = function(err) {
        if (err) {
          env.response.statusCode = 500;
        } else {
          var entity = buildEntity(loader, env, machine, actions);
          env.response.body = entity;
        }

        next(env);
      };

      args.push(cb);

      machine.call.apply(machine, args);
    }


  };

  return DeviceResource;
};
