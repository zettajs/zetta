var os = require('os');
var uuid = require('node-uuid');
var AutoScout = require('zetta-auto-scout');
var async = require('async');
var Device = require('zetta-device');
var HttpDevice = require('zetta-http-device');
var HttpScout = require('./lib/http_scout');
var HttpServer = require('./lib/http_server');
var Logger = require('./lib/logger');
var PeerClient = require('./lib/peer_client');
var PeerRegistry = require('./lib/peer_registry');
var PubSub = require('./lib/pubsub_service');
var Runtime = require('./lib/runtime');
var Scout = require('zetta-scout');
var scientist = require('zetta-scientist');
var Query = require('calypso').Query;

var Zetta = module.exports = function(opts) {
  if (!(this instanceof Zetta)) {
    return new Zetta(opts);
  }

  opts = opts || {};

  this._name = os.hostname(); // optional name, defaults to OS hostname
  this.id = this._name;

  this._exposeQuery = '';
  this._scouts = [];
  this._apps = [];
  this._peers = [];
  this._peerClients = [];
  
  this.peerRegistry = opts.peerRegistry || new PeerRegistry();

  this.pubsub = opts.pubsub || new PubSub();
  this.log = opts.log || new Logger({ pubsub: this.pubsub });
  this.log.init();
  this._silent = false;

  this.httpServer = new HttpServer(this);

  var runtimeOptions = {
    pubsub: this.pubsub,
    log: this.log,
    httpServer: this.httpServer
  };

  if (opts && opts.registry) {
    runtimeOptions.registry = opts.registry;
  }
  this.runtime = new Runtime(runtimeOptions);

  var httpScout = scientist.create.apply(null, [HttpScout]);
  httpScout.server = this.runtime;
  this.httpScout = httpScout;
  this._scouts.push(httpScout);
};

Zetta.prototype.silent = function() {
  this._silent = true;
  return this;
};

// pass in a custom logging
Zetta.prototype.logger = function(func) {
  this._silent = true;
  func(this.log);
  return this;
};

Zetta.prototype.name = function(name) {
  this._name = name;
  this.id = this._name;
  return this;
};

Zetta.prototype.use = function() {
  var args = Array.prototype.slice.call(arguments);
  var constructor = args[0];

  var self = this;
  function addScout(scout) {
    scout.server = self.runtime;
    self._scouts.push(scout);
  }

  function init() {
    var instance = Object.create(constructor.prototype);
    constructor.apply(instance, args.slice(1));
    return scientist.config(instance);
  }

  function walk(proto) {
    if (!proto || !proto.__proto__) {
      self.load(constructor);
    } else if (proto.__proto__.constructor.name === 'HttpDevice') {
      var instance = init();
      self.httpScout.driverFunctions[instance._type] = constructor;
    } else if (proto.__proto__.constructor.name === 'Device') {
      var instance = init();
      args.unshift(instance._type);
      var scout = Object.create(AutoScout.prototype);
      AutoScout.apply(scout, args);
      addScout(scout);
    } else if (proto.__proto__.constructor.name === 'Scout') {
      var scout = scientist.create.apply(null, args);
      addScout(scout);
    } else {
      walk(proto.__proto__);
    }
  }

  walk(constructor.prototype);

  return this;
};

Zetta.prototype.expose = function(query) {
  this._exposeQuery = query;
  this.runtime.expose(query);
  return this;
};

Zetta.prototype.load = function(app) {
  this._apps.push(app);
  return this;
};

Zetta.prototype.link = function(peers) {
  var self = this;
  if(!Array.isArray(peers)) {
    peers = [peers];
  }

  peers.forEach(function(peer) {
    //self._peers.push(new PeerClient(peer, self));
    self._peers.push(peer);
  });

  return this;
};


Zetta.prototype.listen = function() {
  var self = this;

  var args = Array.prototype.slice.call(arguments);

  var last = args[args.length - 1];

  var callback;
  if (typeof last === 'function') {
    callback = last;
  }

  this._run(function(err){
    if(err) {
      if (callback) {
        return callback(err);
      } else {
        throw err;
      }
    }

    var cb = function(err) {
      if (err) {
        if (callback) {
          callback(err);
        } else {
          throw err;
        }
      }

      var host;
      if (typeof args[0] === 'string') {
        host = args[0]; // UNIX socket
      } else if (typeof args[0] === 'number') {
        if (args.length > 1 && typeof args[1] === 'string') {
          host = 'http://' + args[1] + ':' + args[0]; // host + port
        } else {
          host = 'http://127.0.0.1:' + args[0]; // just port
        }
      } else if (typeof args[0] === 'object' && args[0].fd) {
        host = 'fd: ' + args[0].fd; // handle
      } else {
        host = '<unknown>';
      }

      self.log.emit('log', 'server', 'Server (' + self._name + ') ' + self.id + ' listening on ' + host);

      if (callback) {
        callback(err);
      }
    };

    if (!callback) {
      args.push(cb);
    } else {
      args[args.length - 1] = cb;
    }

    self.httpServer.listen.apply(self.httpServer, args);
  });

  return this;
};

// run scouts/apps init server but do not listening on http port
Zetta.prototype._run = function(callback) {
  var self = this;

  if(!callback) {
    callback = function(){};
  }

  if (!this._silent) {
    Logger.ConsoleOutput(this.log);
  }

  async.series([
    function(next) {
      self.runtime.registry._init(next);
    },
    function(next) {
      self.peerRegistry._init(next);
    },
    function(next) {
      self._initScouts(next);
    },
    function(next) {
      self._initApps(next);
    },
    function(next) {
      self._initHttpServer(next);
    },
    function(next) {
      self._cleanupPeers(next);
    },
    function(next) {
      self._initPeers(self._peers, next);
      self.link = function(peers, cb) {
        self._initPeers(peers, (cb || function() {}) );
      };
    }
  ], function(err){
    setImmediate(function() {
      callback(err);
    });
  });

  return this;
};

Zetta.prototype._initScouts = function(callback) {
  async.each(this._scouts, function(scout, next) {
    scout.init(next);
  }, function(err) {
    callback(err);
  });

  return this;
};

Zetta.prototype._initApps = function(callback) {
  var self = this;
  this._apps.forEach(function(app) {
    app(self.runtime);
  });
  callback();

  return this;
};

Zetta.prototype._initHttpServer = function(callback) {
  this.httpServer.init();
  callback();

  return this;
};


// set all peers to disconnected
Zetta.prototype._cleanupPeers = function(callback) {
  var self = this;
  this.peerRegistry.find(Query.of('peers'), function(err, results) {
    if(err) {
      callback(err);  
      return;
    }

    async.forEach(results, function(peer, next) {
      peer.status = 'disconnected';
      self.peerRegistry.save(peer, next);
    }, callback);
  });
};

Zetta.prototype._initPeers = function(peers, callback) {
  var self = this;
  var existingUrls = [];
  var allPeers = [];

  if (!Array.isArray(peers)) {
    peers = [peers];
  }

  this.peerRegistry.find(Query.of('peers'), function(err, results) {
    if(err) {
      callback(err);  
      return;
    }

    results.forEach(function(peer) {
      peer.status = 'disconnected';
      if (peer.direction === 'initiator' && peer.url) {
        allPeers.push(peer);
        existingUrls.push(peer.url);
        return;
      }
    });

    // peers added through js api to registry peers if they don't already exist
    allPeers = allPeers.concat(peers.filter(function(peer) {
      return existingUrls.indexOf(peer) === -1;
    }));

    allPeers.forEach(function(obj) {
      var existing = (typeof obj === 'object');
      if (existing) {
        if(!obj.fromLink || peers.indexOf(obj.url) > -1) {
          self.peerRegistry.save(obj, function() {
            runPeer(obj);
          });
        } else {
          //Delete
          self.peerRegistry.remove(obj, function(err){
            if(err) {
              console.error(err);
            }
          });
        }
      } else {
        var peerData = {
          url: obj,
          direction: 'initiator',
          fromLink:true
        }; 
        self.peerRegistry.add(peerData, function(err, newPeer) {
          runPeer(newPeer);
        });
      }
      
      function runPeer(peer) {
        var peerClient = new PeerClient(peer.url, self);
        self._peerClients.push(peerClient);

        // when websocket is established
        peerClient.on('connecting', function() {
          peer.status = 'connecting';
          self.peerRegistry.save(peer);
        });
        
        // when peer handshake is made
        peerClient.on('connected', function() {
          peer.status = 'connected';
          self.peerRegistry.save(peer);

          // peer-event
          self.pubsub.publish('_peer/connect', { peer: peerClient});
        });

        peerClient.on('error', function(error) {
          self.peerRegistry.get(peer.id, function(err, result) {
            result.status = 'failed';
            result.error = error;
            self.peerRegistry.save(result);
            
            // peer-event
            self.pubsub.publish('_peer/disconnect', { peer: peerClient });
          });
        });

        peerClient.on('closed', function(reconnect) {
          self.peerRegistry.get(peer.id, function(err, result) {
            result.status = 'disconnected';

            // peer-event
            self.pubsub.publish('_peer/disconnect', { peer: peerClient });
            self.peerRegistry.save(result, function() { });
          });
        });

        peerClient.start();
      }
    });
    
    // end after db read
    callback();
  });

  return this;
};
