const EventEmitter = require('events').EventEmitter;
const util = require('util');
const async = require('async');
const decompile = require('calypso-query-decompiler');
const Rx = require('rx');
const Logger = require('./logger');
const Query = require('calypso').Query;
const PubSub = require('./pubsub_service');
const VirtualDevice = require('./virtual_device');
const querytopic = require('./query_topic');

const DeviceRegistry = require('./device_registry');

const Runtime = module.exports = function(opts) {
  EventEmitter.call(this);
  const self = this;

  if (!opts) {
    opts = {};
  }
  this.registry = opts.registry ||  new DeviceRegistry();
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
  this.on('deviceready', device => {
    device.on('destroy', (device, cb) => {
      self._onDestroy(device, cb);  
    });
  });

  this._peerRequestExtensions = [];
  this._peerResponseExtensions = [];

  this.filter = this._observable.filter.bind(this._observable);
  this.map = this._observable.map.bind(this._observable);
  this.take = this._observable.take.bind(this._observable);
  this.zip = this._observable.zip.bind(this._observable);
  this.subscribe = this._observable.subscribe.bind(this._observable);
};
util.inherits(Runtime, EventEmitter);

Logger.LEVELS.forEach(level => {
  Runtime.prototype[level] = function(message, data) {
    this._log[level]('user-log', message, data);
  };
});

Runtime.prototype.from = server => {
  const q = Query.of('devices');
  q.remote = true;
  q.server = server;

  return q;
};

Runtime.prototype.ql = q => Query.of('devices').ql(q);

Runtime.prototype.query = () => Query.of('devices');

Runtime.prototype.where = q => Query.of('devices').where(q);

Runtime.prototype.expose = function(query) {
  const self = this;
  if(typeof query === 'string' && query === '*') {
    query = new Query(query);
  }

  this.on('deviceready', device => {
    self.registry.match(query, device, (err, match) => {
      if (match) {
        self._exposeDevice(device);
      }
    });
  });
};


Runtime.prototype._exposeDevice = function(device) {
  this.exposed[`${this.path}/${device.id}`] = device;
};

//This is the new observe syntax. It will take an array of queries, and a callback.
Runtime.prototype.observe = function(queries, cb) {
  var self = this;
  var filters = [];
  let observable = this._observable;

  if (!Array.isArray(queries)) {
    queries = [queries];
  }

  if(Object.keys(this._jsDevices).length) {
    const existingDeviceObservable = Rx.Observable.create(observer => {
      Object.keys(self._jsDevices).forEach(deviceId => {
        observer.onNext(self._jsDevices[deviceId]);
      });
    });
    observable = Rx.Observable.merge(this._observable, existingDeviceObservable);
  }

  var filters = [];
  var self = this;
  queries.forEach(query => {
    if (query.remote === true) {
      let ql = decompile(query);
      const toRemove = 'select * ';
      if (ql.slice(0, toRemove.length) === toRemove) {
        ql = ql.slice(toRemove.length);
      }

      var queryObservable = Rx.Observable.create(observer => {

        // peer not connected or query is for all peers
        if (!self.httpServer.peers[query.server] || query.server === '*') {
          // init peer on connect / reconnect
          self.pubsub.subscribe('_peer/connect', (ev, data) => {
            if (data.peer.name === query.server) {
              // subscribe to the topic on peer, but keep track of topics in runtime 
              // to only ever setup a topic once.
              self.on(`${data.peer.name}/remotedeviceready`, device => {
                self.registry.match(query, device, (err, match) => {
                  if (match) {
                    observer.onNext(device);
                  }
                });
              });

              self._initRemoteQueryListener(ql, data.peer);
            }
          });
        }

        function setupForPeer(peerName) {
          const peer = self.httpServer.peers[peerName];
          if (!peer) {
            return;
          }

          // iterate through existing remote devices
          if (self._remoteDevices[peer.name]) {
            Object.keys(self._remoteDevices[peer.name]).forEach(deviceId => {
              const device = self._remoteDevices[peer.name][deviceId];
              self.registry.match(query, device, (err, match) => {
                if (!match) {
                  return;
                }

                // Handle when peer for remote device was dissconnected
                // TODO: Probably should not handle it only on device._socket but device state is disconnected
                if (device._socket.status !== 'connected') {
                  device._socket.once('connected', () => {
                    observer.onNext(device);
                  });
                  return;
                }

                observer.onNext(device);
              });
            });
          }


          // listen for devices comming online from remote per observer
          self.on(`${peer.name}/remotedeviceready`, device => {
            self.registry.match(query, device, (err, match) => {
              if (match) {
                observer.onNext(device);
              }
            });
          });
          
          self._initRemoteQueryListener(ql, peer);
        }

        if (query.server === '*') {
          const peersSetup = [];
          Object.keys(self.httpServer.peers).forEach(peerName => {
            peersSetup.push(peerName);
            setupForPeer(peerName);
          });
          
          // setup all future peers
          self.pubsub.subscribe('_peer/connect', (e, data) => {
            if (peersSetup.indexOf(data.peer.name) === -1) {
              peersSetup.push(data.peer.name);
              setupForPeer(data.peer.name);
            }
          })
        } else {
          setupForPeer(query.server);
        }
      });

      filters.push(queryObservable);
    } else {
      var queryObservable = observable.flatMap(device => Rx.Observable.create(observer => {
        self.registry.match(query, device, (err, match) => {
          if (match) {
            observer.onNext(device);
          }
        });
      }));

      filters.push(queryObservable);
    }
  });

  let source = null;
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
      .subscribe(args => {
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

Runtime.prototype.onPeerRequest = function(fn) {
  this._peerRequestExtensions.push(fn);
};

Runtime.prototype.onPeerResponse = function(fn) {
  this._peerResponseExtensions.push(fn);
};

Runtime.prototype.modifyPeerRequest = function(ws) {
  ws.extendRequest(this._peerRequestExtensions);
};

Runtime.prototype.modifyPeerResponse = function(ws) {
  ws.extendResponse(this._peerResponseExtensions);
};

Runtime.prototype._initRemoteQueryListener = function(ql, peer) {
  const self = this;

  if (!this._remoteDevices[peer.name]) {
    this._remoteDevices[peer.name] = {};
    this._remoteSubscriptions[peer.name] = {};
  }

  const topic = querytopic.format({ql: ql});

  // already subscribed to the query topic
  if(this._remoteSubscriptions[peer.name][topic]) {
    return;
  }
  
  // set up reactive query with peer and call onNext when available.
  peer.subscribe(encodeURIComponent(topic));

  this._remoteSubscriptions[peer.name][topic] = data => {
    self._createRemoteDevice(peer, data);
  };

  peer.on(topic, this._remoteSubscriptions[peer.name][topic]);
};

Runtime.prototype._createRemoteDevice = function(peer, data) {
 // device already in local memory, dont fire again
  const self = this;
  if (self._remoteDevices[peer.name][data.properties.id]) {
    return;
  }
  const virtualDevice = new VirtualDevice(data, peer);
  virtualDevice.on('remote-destroy', virtualDevice => {
    delete self._remoteDevices[peer.name][data.properties.id];  
  });
  self._remoteDevices[peer.name][data.properties.id] = virtualDevice;
  self.emit(`${peer.name}/remotedeviceready`, virtualDevice);
  return virtualDevice;
};

Runtime.prototype._onDestroy = function(device, cb) {
  const self = this;
  if(!cb) {
    cb = () => {};  
  }
  this._destroyDevice(device, err => {
    if(err) {
     self._log.emit('error', 'server', `Device (${device.id}) could not be deleted. Error: ${err.message}`); 
    }
    
    cb(err);  
  }); 
};

Runtime.prototype._destroyDevice = function(device, cb) {
  const self = this;
  if(!cb) {
    cb = () => {};  
  }
  device.state = 'zetta-device-destroy';
  if(typeof device._sendLogStreamEvent === 'function') {
    device._sendLogStreamEvent('zetta-device-destroy', [], () => {
      self.registry.remove(device, err => {
        if(err) {
          cb(err);  
        } else {
          delete self._jsDevices[device.id];
          cb(null);
        }  
      });
    }); 
  } else {
    self._log.emit('error', 'server', `Device (${device.id}) could not be deleted. Error: Device incompatible with delete functionality.`); 
    cb(new Error('Device not compatible'));
  }
};
