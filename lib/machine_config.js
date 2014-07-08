var EventEmitter = require('events').EventEmitter;
var pubsub = require('./pubsub_service.js');
var ObjectStream = require('./data_stream');
var Logger = require('./logger');
var rel = require('./api_rels');

var l = Logger();


var MachineConfig = module.exports = function(machine) {
  this.machine = machine;
  this.transitions = {};
  this.allowed = {};
  this._devices = [];
  this.emitter = new EventEmitter();
  this.monitors = [];

  var self = this;

  this.machine.on = function(type, handler) {
    self.emitter.on(type, handler);
  }.bind(this.machine);

  this.machine.properties = {};
  var reserved = ['properties', 'allowed', 'transitions', '_devices', 'streams'];

  this.machine.update = function() {
    var properties = {};
    var self = this;
    Object.keys(self).forEach(function(key) {
      if (reserved.indexOf(key) === -1 && typeof self[key] !== 'function' && key[0] !== '_') {
        properties[key] = self[key];
      }
    });

    this.properties = properties;
  }.bind(this.machine);

  this.machine.update();

  // TODO: Namespace this as something weird so there's no accidental override.
  this.machine.transitions = this.transitions;
  this.machine.allowed = this.allowed;
  this.machine.call = this.call.bind(this);
  this.machine.emit = this.emitter.emit.bind(this.emitter);
  this.machine.devices = this.devices.bind(this);
  this.machine._devices = this._devices;
  this.machine.toSirenEntity = this.toSirenEntity.bind(this.machine);
  this.machine.toSirenEntityFull = this.toSirenEntityFull.bind(this.machine);
  this.machine.buildActions = this.buildActions.bind(this.machine);
  this.machine.buildEntity = this.buildEntity.bind(this.machine);
  this.machine.buildStreamLinks = this.buildStreamLinks.bind(this.machine);
  this.machine.streams = {};
};

MachineConfig.prototype.stream = function(queueName, handler) {

  var queue = this.machine.type + '/' + this.machine.id + '/' + queueName;

  var dataStream = new ObjectStream(queue);
  this.machine.streams[queueName] = dataStream;

  handler.call(this.machine, dataStream);

  return this;
};

MachineConfig.prototype.map = function(type, handler, fields) {
  this.transitions[type] = { handler: handler, fields: fields };
  return this;
};

MachineConfig.prototype.devices = function(subdevices) {
  this._devices = this._devices.concat(subdevices);
  this.machine._devices = this._devices;
  return this;
};

MachineConfig.prototype.when = function(state, options) {
  var allow = options.allow;
  if (!allow) {
    return this;
  }

  this.allowed[state] = allow;

  return this;
};

MachineConfig.prototype.call = function(/* type, ...args */) {
  var args = Array.prototype.slice.call(arguments);
  var type = args[0];
  var next = args[args.length-1];

  var rest = null;
  if(typeof next !== 'function') {
    next = function(err){};
    rest = args.slice(1, args.length);
  } else {
    rest = args.slice(1, args.length - 1);
  }

  var self = this;
  var cb = function callback() {

    var properties = {};
    Object.keys(self.machine).forEach(function(key) {
      if (key[0] !== '_' && typeof self.machine[key] !== 'function' && ['transitions', 'allowed', 'properties'].indexOf(key) === -1) {
        properties[key] = self.machine[key];
      }
    });

    self.machine.properties = properties;

    var cbArgs = Array.prototype.slice.call(arguments);
    if (cbArgs.length && cbArgs[0] instanceof Error) {
      self.emitter.emit('error', cbArgs[0]);
    } else {
      cbArgs.unshift(type);
      self.emitter.emit.apply(self.emitter, cbArgs);
      var d = { name: self.name, transition: type, properties: self.machine.properties };
      pubsub.publish(self.machine.type + '/_transitions', d);
      l.emit('log', 'fog-runtime', 'MachineConfig ' + self.machine.type + ' transititon ' + type, d);
    }

    next.apply(arguments);
  };
  var handlerArgs = rest.concat([cb]);

  if (this.transitions[type]) {
    if(this.transitions[type].handler === undefined){
      throw new Error('Machine does not implement transition '+type);
      return;
    }
    var state = self.machine.properties.state;
    var allowed = this.allowed[state];
    if (allowed.indexOf(type) > -1) {
      this.transitions[type].handler.apply(this.machine, handlerArgs);
    } else {
      throw new Error('Machine cannot use transition ' + type + ' while in ' + state);
    }
  }
};

MachineConfig.prototype.monitor = function(queueName) {
  var queue = this.machine.type + '/' + this.machine.id + '/' + queueName;

  var stream = new ObjectStream(queue);
  this.machine.streams[queueName] = stream;
  this.monitors.push(stream);

  var self = this;

  Object.defineProperty(this.machine, queueName, {
    get: function(){
      if(self.machine.properties.hasOwnProperty(queueName)) {
        return self.machine.properties[queueName];
      } else {
        return self.machine[queueName];
      }
    },
    set: function(newValue){
      stream.write(newValue);
      self.machine.properties[queueName] = newValue;
    }
  });

  return this;
};

MachineConfig.prototype.name = function(name) {
  this.machine.properties.name = name;
  this.machine.name = name;
  return this;
};

MachineConfig.prototype.type = function(machineType) {
  this.machine.type = machineType;
  this.machine.properties.type = machineType;
  return this;
};

MachineConfig.prototype.state = function(stateName) {
  this.machine.properties.state = stateName;
  this.machine.state = stateName;
  return this;
};

MachineConfig.prototype.toSirenEntity = function(loader, env) {
  var entity = this.buildEntity(loader, env);
  return entity;
};

MachineConfig.prototype.toSirenEntityFull = function(loader, env) {
  var actions = this.buildActions(env);
  var entity = this.buildEntity(loader, env, actions);
  entity.links = entity.links.concat(this.buildStreamLinks(loader, env));
  return entity;
};

MachineConfig.prototype.buildActions = function(env) {
  var actions = null;
  var self = this;

  Object.keys(self.transitions).forEach(function(type) {
    var transition = self.transitions[type];
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

MachineConfig.prototype.buildStreamLinks = function(loader, env) {
  var links = [];
  var devicePath = env.helpers.url.path(loader.path + '/devices/' + this.id);
  Object.keys(this.streams).forEach(function(name) {
    var stream = {
      title: name,
      rel: ['monitor', rel.objectStream],
      href: devicePath.replace('http', 'ws') + '/' + name
    };
    links.push(stream);
  });

  return links;
};

MachineConfig.prototype.buildEntity = function(loader, env, actions) {

  var self = this;
  this.update();
  var entity = {
    class: ['device'],
    properties: this.properties,
    actions: actions,
    links: [{ rel: ['self'], href: env.helpers.url.path(loader.path + '/devices/' + this.id) },
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

      var allowed = self.allowed[self.state];
      if (allowed && allowed.indexOf(action.name) > -1) {
        return action;
      }
    });
  }

  return entity;
};


MachineConfig.create = function(machine) {
  return new MachineConfig(machine);
};


