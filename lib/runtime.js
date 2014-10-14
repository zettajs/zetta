var EventEmitter = require('events').EventEmitter;
var util = require('util');
var async = require('async');
var decompile = require('calypso-query-decompiler');
var Rx = require('rx');
var Logger = require('./logger');
var Query = require('calypso').Query;
var PubSub = require('./pubsub_service');
var VirtualDevice = require('./virtual_device');

var Registry = require('./registry');

var Runtime = module.exports = function(opts) {
  EventEmitter.call(this);

  if (!opts) {
    opts = {};
  }
  this.registry = opts.registry ||  new Registry();
  this.pubsub = opts.pubsub || new PubSub();
  this._log = opts.log || new Logger({pubsub: this.pubsub});
  this.peers = opts.peers || {};

  this.exposed = {};
  this.path = '/devices';
  this.exposeQuery = null;
  this._jsDevices = {};
  this._observable = Rx.Observable.fromEvent(this, 'deviceready');

  this.filter = this._observable.filter.bind(this._observable);
  this.map = this._observable.map.bind(this._observable);
  this.take = this._observable.take.bind(this._observable);
  this.zip = this._observable.zip.bind(this._observable);
  this.subscribe = this._observable.subscribe.bind(this._observable);
};
util.inherits(Runtime, EventEmitter);

Runtime.prototype.log = function(message, data) {
  this._log.emit('user-log', message, data);
};

Runtime.prototype.from = function(server) {
  var q = Query.of('devices');
  q.remote = true;
  q.server = server;

  return q;
};

Runtime.prototype.ql = function(q) {
  return Query.of('devices').ql(q);
};

Runtime.prototype.query = function() {
  return Query.of('devices');
};

Runtime.prototype.where = function(q) {
  return Query.of('devices').where(q);
};

Runtime.prototype.expose = function(query) {
  var self = this;
  if(typeof query === 'string' && query === '*') {
    query = new Query(query);
  }

  this.on('deviceready', function(device) {
    self.registry.match(query, device, function(err, match) {
      if (match) {
        self._exposeDevice(device);
      }
    });
  });
};


Runtime.prototype._exposeDevice = function(device) {
  this.exposed[this.path + '/' + device.id] = device;
};

//This is the new observe syntax. It will take an array of queries, and a callback.
Runtime.prototype.observe = function(queries, cb) {
  var self = this;
  var filters = [];
  var observable = this._observable;

  if (!Array.isArray(queries)) {
    queries = [queries];
  }

  if(Object.keys(this._jsDevices).length) {
    var existingDeviceObservable = Rx.Observable.create(function(observer) {
      Object.keys(self._jsDevices).forEach(function(deviceId) {
        observer.onNext(self._jsDevices[deviceId]);
      });
    });
    observable = Rx.Observable.merge(this._observable, existingDeviceObservable);
  }

  var filters = [];
  var self = this;
  queries.forEach(function(query) {
    if (query.remote === true) {
      var ql = decompile(query);
      var toRemove = 'select * ';
      if (ql.slice(0, toRemove.length) === toRemove) {
        ql = ql.slice(toRemove.length);
      }

      // handle case of query.server = '*'

      var peer = self.peers[query.server];

      var queryObservable = Rx.Observable.create(function(observer) {
        if (!peer) {
          self.pubsub.subscribe('_peer/connect', function(ev, data) {
            var p = data.peer;
            if (p.name === query.server) {
              // set up reactive query with peer and call onNext when available.
              p.subscribe(encodeURIComponent('query/' + ql), function() {
              });
              //TODO: Prevent multiple event listeners from being created if _peer/connect fires mulitiple times.
              p.on('query/' + ql, function(data) {
                var virtualDevice = new VirtualDevice(data, p);
                observer.onNext(virtualDevice);
              });
            }
          });
        } else {
          peer.subscribe(encodeURIComponent('query/' + ql), function() {
          });

          peer.on('query/' + ql, function(data) {
            var virtualDevice = new VirtualDevice(data, peer);
            observer.onNext(virtualDevice);
          });

            // set up reactive query with peer and call onNext when available.
        }
      });

      filters.push(queryObservable);
    } else {
      var queryObservable = observable.flatMap(function(device) {
        return Rx.Observable.create(function(observer) {
          self.registry.match(query, device, function(err, match) {
            if (match) {
              observer.onNext(device);
            }
          });
        });
      });

      filters.push(queryObservable);
    }
  });

  var source = null;
  if(filters.length > 1) {
    filters.push(function() {
      return Array.prototype.slice.call(arguments);
    });
    source = Rx.Observable.zip.apply(null, filters);
  } else {
    source = filters[0];
  }

  return !cb ? source : 
    source
      .subscribe(function(args){
        if (Array.isArray(args)) {
          cb.apply(null, args);
        } else {
          cb.apply(null, [args]);
        }
      });
};

// raw db -
Runtime.prototype.find = function() {
  return this.registry.find.apply(this.registry, arguments);
};
