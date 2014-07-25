var EventEmitter = require('events').EventEmitter;
var uuid = require('node-uuid');
var ObjectStream = require('./object_stream');
var BinaryStream = require('./binary_stream')
var Logger = require('./logger');
var PubSub = require('./pubsub_service');
var ConsumerStream = require('./consumer_stream');

var Device = module.exports = function() {
  this.id = uuid.v4();

  this.streams = {}; // has __getter__ for consumer streams
  this._streams = {}; // has actual streams supplied to .stream and .monitor
  this._emitter = new EventEmitter();
  this._allowed = {};
  this._transitions = {};
  this._monitors = [];
  this._pubsub = new PubSub();
  this._log = new Logger({ pubsub: this._pubsub });

  var self = this;
  this.on = function(type, handler) {
    self._emitter.on(type, handler);
  }.bind(this);

  // TODO: Namespace this as something weird so there's no accidental override.
  this.call = this.call.bind(this);
  this.emit = this._emitter.emit.bind(this._emitter);
};

Device.prototype._generate = function(config) {
  var self = this;
  this.type = config._type;
  this.name = config._name;
  this._state = config._state;
  this._transitions = config.transitions;
  this._allowed = config.allowed;

  var stateStream = self._createStream('state', ObjectStream);
  Object.defineProperty(this, 'state', {
    get: function(){
      return self._state;
    },
    set: function(newValue){
      self._state = newValue;
      stateStream.write(newValue);
    }
  });
  
  this._monitors = [];
  config.monitors.forEach(function(name) {
    self._initMonitor(name);
    self._monitors.push(name);
  });
  
  Object.keys(config.streams).forEach(function(name) {
    var s = config.streams[name];
    self._initStream(name, s.handler, s.options);
  });
  
};

Device.prototype.call = function(/* type, ...args */) {
  var args = Array.prototype.slice.call(arguments);
  var type = args[0];
  var next = args[args.length-1];

  var rest = null;
  if(typeof next !== 'function') {
    next = function(err){
      if (err) {
        throw err;
      }
    };
    rest = args.slice(1, args.length);
  } else {
    rest = args.slice(1, args.length - 1);
  }
  
  var self = this;
  var cb = function callback() {
    var cbArgs = Array.prototype.slice.call(arguments);
    if (cbArgs.length && cbArgs[0] instanceof Error) {
      self._emitter.emit('error', cbArgs[0]);
    } else {
      cbArgs.unshift(type);
      self._emitter.emit.apply(self._emitter, cbArgs);

      var args = [];
      if (self._transitions[type].fields) {
        self._transitions[type].fields.forEach(function(field, idx) {
          args.push({ name: field.name, value: rest[idx] });
        });
      }

      var topic = self.type + '/' + self.id + '/logs';
      var json = ObjectStream.format(topic, null);
      delete json.data;
      json.transition = type;
      json.input = args;
      json.properties = self.properties();
      self._pubsub.publish(topic, json);

      self._log.emit('log', 'device', self.type + ' transition ' + type, json);
    }

    next.apply(arguments);
  };
  var handlerArgs = rest.concat([cb]);
  if (this._transitions[type]) {
    if(this._transitions[type].handler === undefined){
      return next(new Error('Machine does not implement transition '+type));
    }
    var state = self.state;
    var allowed = this._allowed[state];
    if (allowed.indexOf(type) > -1) {
      this._transitions[type].handler.apply(this, handlerArgs);
    } else {
      next(new Error('Machine cannot use transition ' + type + ' while in ' + state));
    }
  }
};

Device.prototype.properties = function() {
  var properties = {};
  var self = this;
  
  var reserved = ['streams'];

  Object.keys(self).forEach(function(key) {
    if (reserved.indexOf(key) === -1 && typeof self[key] !== 'function' && key[0] !== '_') {
      properties[key] = self[key];
    }
  });

  this._monitors.forEach(function(name) {
    properties[name] = self[name];
  });

  properties.state = this.state;
  
  return properties;
};

Device.prototype.save = function(cb) {
  this._registry.save(this, cb);
};

Device.prototype._initMonitor = function(queueName) {
  var stream = this._createStream(queueName, ObjectStream);
  var self = this;
  var value = null;
  Object.defineProperty(this, queueName, {
    get: function(){
      return value;
    },
    set: function(newValue){
      value = newValue;
      stream.write(newValue);
    }
  });
  return this;
};

Device.prototype._initStream = function(queueName, handler, options) {
  if (!options) {
    options = {};
  }
  var Type = (options.binary) ? BinaryStream : ObjectStream;
  var stream = this._createStream(queueName, Type);
  handler.call(this, stream);
  return this;
};

Device.prototype._createStream = function(name, StreamType) {
  var self = this;
  var queue = this.type + '/' + this.id + '/' + name;
  var stream = new StreamType(queue, {}, this._pubsub);
  this._streams[name] = stream;

  Object.defineProperty(this.streams, name, {
    get: function(){
      return new ConsumerStream(queue, { objectMode: stream._writableState.objectMode }, self._pubsub);
    }
  });

  return stream;
};
