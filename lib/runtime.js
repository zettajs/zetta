var EventEmitter = require('events').EventEmitter;
var util = require('util');
var Rx = require('rx');
var RxWrap = require('./observable_rx_wrap');
var Logger = require('./logger')();
var Query = require('./query');

var Registry = require('./registry');

var Runtime = module.exports = function(opts) {
  EventEmitter.call(this);
  //There are locking issues in the unit tests. This is a brief work around.
  if(opts && opts.registry) {
    this.registry = opts.registry;
  } else {
    this.registry = new Registry();
  }
  this.exposed = {};
  this.path = '/devices';
  this.exposeQuery = null;
  this._jsDevices = [];
  this._observable = Rx.Observable.fromEvent(this, 'deviceready');
};
util.inherits(Runtime, EventEmitter);

//
Runtime.prototype.log = function(message, data) {
  Logger.emit('user-log', message, data);
};

// query related
Runtime.prototype.ql = function() {};

//for now we'll just return the JavaScript object.
Runtime.prototype.where = function(params) {
  return new Query(params);
};

Runtime.prototype.expose = function(query) {

  if(typeof query === 'string' && query === '*') {
    query = new Query(query);
  }

  var self = this;

  this.on('deviceready', function(device) {
    if(query.match(device)) {
      self._exposeDevice(device);
    }
  });
};

Runtime.prototype._exposeDevice = function(device) {
  this.exposed[this.path + '/' + device.id] = device;
};

//This is the new observe syntax. It will take an array of queries, and a callback.
Runtime.prototype.observe = function(queries, cb) {
  var self = this;
  var filters = [];

  queries.forEach(function(query){
    var filter = self._observable.filter(function(device) {
      console.log(device);
      return query.match(device);
    });
    filters.push(filter);
  });

  var source = filters.shift();

  if(filters.length !== 1) {
    filters.push(function() {
      return arguments;
    });
    source.zip.apply(source, filters);
  }

  source
    .subscribe(function(args){
      if (Array.isArray(args)) {
        cb.apply(null, Array.prototype.slice.call(args));
      } else {
        cb.apply(null, [args]);
      }
    });
};

// raw db -
Runtime.prototype.find = function() {
  return this.registry.find.apply(this.registry, arguments);
};
