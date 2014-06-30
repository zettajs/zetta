var EventEmitter = require('events').EventEmitter;
var util = require('util');
var Rx = require('rx');
var RxWrap = require('./observable_rx_wrap');
var Logger = require('./logger')();
var Query = require('./query');

var Registry = require('./registry');

var DeviceResource = require('./device_resource');

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

Runtime.prototype.createDeviceResource = function() {
  return DeviceResource.create(this);
};

//This is the new observe syntax. It will take an array of queries, and a callback.
Runtime.prototype.observe = function(queries, cb) {
  var self = this;
  var observables = [];

  queries.forEach(function(query){
    observables.push(self._generateObservable(query));
  });

  var firstObservable = observables.shift();
  if(observables.length > 1) {
    firstObservable
      .zip(observables, function(){
        return arguments;
      });
  }

  firstObservable
    .subscribe(function(args){
      if (Array.isArray(args)) {
        cb.apply(null, Array.prototype.slice.call(args));
      } else {
        cb.apply(null, [args]);
      }
    });
};

//This will take a simple object based query and generate an observable from it.
Runtime.prototype._generateObservable = function(query) {
  var self = this;

  var observableCallback = function(query) {
    function fn(observer) {

      //Here we iteraate through device props for a match.
      var checkDevice = function(device){
        if(query.match(device)){
          observer.onNext(device);
        }
      }

      self.on('deviceready', checkDevice);

      var observableReturn = function() {
        self.removeListener('deviceready', checkDevice)
      }

      return observableReturn;
    }

    return fn;
  }

  var observable = Rx.Observable.create(observableCallback(query));
  return RxWrap.create(observable);
};

// raw db -
Runtime.prototype.find = function() {
  return this.registry.find.apply(this.registry, arguments);
};
