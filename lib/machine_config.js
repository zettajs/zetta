var EventEmitter = require('events').EventEmitter;
var pubsub = require('./pubsub_service.js');
var ZettaDataStream = require('./data_stream');
var Logger = require('./logger');
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
  var reserved = ['properties', 'allowed', 'transitions', '_devices'];

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
  this.machine.streams = [];
};

MachineConfig.prototype.stream = function(queueName, handler) {

  queueName = this.machine.type + '/' + this.machine.id + '/' + queueName;

  var dataStream = new ZettaDataStream(queueName);
  this.machine.streams.push(queueName);

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
      l.emit('log', 'fog-runtime', 'Device ' + self.machine.type + ' transititon ' + type, d);
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
  var propName = queueName;

  queueName = this.machine.type + '/' + this.machine.id + '/' + propName;

  this.machine.streams.push(queueName);
  var stream = new ZettaDataStream(queueName);
  this.monitors.push(stream);

  var self = this;

  Object.defineProperty(this.machine, propName, {
    get: function(){
      if(self.machine.properties.hasOwnProperty(propName)) {
        return self.machine.properties[propName];
      } else {
        return self.machine[propName];
      }
    },
    set: function(newValue){
      stream.write(newValue);
      self.machine.properties[propName] = newValue;
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

MachineConfig.create = function(machine) {
  return new MachineConfig(machine);
};
