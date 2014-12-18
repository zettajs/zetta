var EventEmitter = require('events').EventEmitter;
var util = require('util');
var async = require('async');
var decompile = require('calypso-query-decompiler');
var Rx = require('rx');
var Logger = require('./logger');
var Query = require('calypso').Query;
var PubSub = require('./pubsub_service');
var VirtualDevice = require('./virtual_device');
var querytopic = require('./query_topic');

var Registry = require('./registry');

var Runtime = module.exports = function(opts) {
  EventEmitter.call(this);

  if (!opts) {
    opts = {};
  }
  this.registry = opts.registry ||  new Registry();
  this.pubsub = opts.pubsub || new PubSub();
  this._log = opts.log || new Logger({pubsub: this.pubsub});
  this.httpServer = opts.httpServer|| {};

  this.exposed = {};
  this.path = '/devices';
  this.exposeQuery = null;
  this._jsDevices = {};

  // store remove virtual devices per server
  this._remoteDevices = {}; // { <server_name>: { <device_id>: virtualDevice  }  }
  this._remoteSubscriptions = {}; // { <server_name>: { <query>: listener }  }

  this._observable = Rx.Observable.fromEvent(this, 'deviceready');

  this.filter = this._observable.filter.bind(this._observable);
  this.map = this._observable.map.bind(this._observable);
  this.take = this._observable.take.bind(this._observable);
  this.zip = this._observable.zip.bind(this._observable);
  this.subscribe = this._observable.subscribe.bind(this._observable);
};
util.inherits(Runtime, EventEmitter);

Logger.LEVELS.forEach(function(level) {
  Runtime.prototype[level] = function(message, data) {
    this._log[level]('user-log', message, data);
  };
});

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
      var peer = self.httpServer.peers[query.server] || self.httpServer._disconnectedPeers[query.server];

      var queryObservable = Rx.Observable.create(function(observer) {

        if (!peer) {
          // init peer on connect / reconnect
          self.pubsub.subscribe('_peer/connect', function(ev, data) {
            if (data.peer.name === query.server) {
              // subscribe to the topic on peer, but keep track of topics in runtime 
              // to only ever setup a topic once.
              self._initRemoteQueryListener(ql, data.peer);
            }
          });
        } else {
          // iterate through existing remote devices
          if (self._remoteDevices[peer.name]) {
            Object.keys(self._remoteDevices[peer.name]).forEach(function(deviceId) {
              var device = self._remoteDevices[peer.name][deviceId];
              self.registry.match(query, device, function(err, match) {
                if (!match) {
                  return;
                }

                // Handle when peer for remote device was dissconnected
                // TODO: Probably should not handle it only on device._socket but device state is disconnected
                if (device._socket.status !== 'connected') {
                  device._socket.once('connected', function() {
                    observer.onNext(device);
                  });
                  return;
                }

                observer.onNext(device);
              });
            });
          }

          self._initRemoteQueryListener(ql, peer);
        }

        // listen for devices comming online from remote per observer
        self.on(query.server + '/remotedeviceready', function(device) {
          self.registry.match(query, device, function(err, match) {
            if (match) {
              observer.onNext(device);
            }
          });
        });

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

Runtime.prototype._initRemoteQueryListener = function(ql, peer) {
  var  self = this;

  if (!this._remoteDevices[peer.name]) {
    this._remoteDevices[peer.name] = {};
    this._remoteSubscriptions[peer.name] = {};
  }

  var topic = querytopic.format({ql: ql});

  // already subscribed to the query topic
  if(this._remoteSubscriptions[peer.name][topic]) {
    return;
  }
  
  // set up reactive query with peer and call onNext when available.
  peer.subscribe(encodeURIComponent(topic));

  this._remoteSubscriptions[peer.name][topic] = function(data) {
    // device already in local memory, dont fire again
    if (self._remoteDevices[peer.name][data.properties.id]) {
      return;
    }
    var virtualDevice = new VirtualDevice(data, peer);
    self._remoteDevices[peer.name][data.properties.id] = virtualDevice;
    self.emit(peer.name + '/remotedeviceready', virtualDevice);
  };

  peer.on(topic, this._remoteSubscriptions[peer.name][topic]);
};
