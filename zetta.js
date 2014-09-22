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

var Zetta = module.exports = function(opts) {
  if (!(this instanceof Zetta)) {
    return new Zetta(opts);
  }

  opts = opts || {};

  this.id = uuid.v4(); // unique id of server
  this._name = os.hostname(); // optional name, defaults to OS hostname

  this._exposeQuery = '';
  this._scouts = [];
  this._apps = [];
  this._peers = [];
  
  this.peerRegistry = opts.peerRegistry || new PeerRegistry();

  this.pubsub = opts.pubsub || new PubSub();
  this.log = opts.log || new Logger({ pubsub: this.pubsub });

  var runtimeOpts = { pubsub: this.pubsub, log: this.log };
  if (opts && opts.registry) {
    runtimeOpts.registry = opts.registry;
  }
  this.runtime = new Runtime(runtimeOpts);
  this.httpServer = new HttpServer(this);

  var httpScout = scientist.create.apply(null, [HttpScout]);
  httpScout.server = this.runtime;
  this.httpScout = httpScout;
  this._scouts.push(httpScout);

};

Zetta.prototype.name = function(name) {
  this._name = name;
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
    constructor.call(instance, args.slice(1));
    return scientist.config(instance);
  }

  function walk(proto) {
    if (!proto || !proto.__proto__) {
      self.load(constructor);
    } else if (proto.__proto__ === HttpDevice.prototype) {
      var instance = init();
      self.httpScout.driverFunctions[instance._type] = constructor;
    } else if (proto.__proto__ === Device.prototype) {
      var instance = init();
      args.unshift(instance._type);
      var scout = Object.create(AutoScout.prototype);
      AutoScout.apply(scout, args);
      addScout(scout);
    } else if (proto.__proto__ === Scout.prototype) {
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


Zetta.prototype.listen = function(port, callback) {
  var self = this;

  if(!callback) {
    callback = function() {};
  }

  this._run(function(err){
    if(err) {
      return callback(err);
    }

    self.httpServer.listen(port, callback);
  });

  return this;
};

// run scouts/apps init server but do not listening on http port
Zetta.prototype._run = function(callback) {
  var self = this;

  if(!callback) {
    callback = function(){};
  }

  async.series([
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
      self._initPeers(next);
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
  this.peerRegistry.find({ match: function() { return true; } }, function(err, results) {
    async.forEach(results, function(peer, next) {
      peer.status = 'disconnected';
      self.peerRegistry.save(peer, next);
    }, callback);
  });
};

Zetta.prototype._initPeers = function(callback) {
  var self = this;
  var existingUrls = [];
  var allPeers = [];

  this.peerRegistry.find({ match: function() { return true; } }, function(err, results) {
    results.forEach(function(peer) {
      peer.status = 'disconnected';
      if (peer.direction === 'initiator' && peer.url) {
        allPeers.push(peer);
        existingUrls.push(peer.url);
        return;
      }
    });

    // peers added through js api to registry peers if they don't already exist
    allPeers = allPeers.concat(self._peers.filter(function(peer) {
      return existingUrls.indexOf(peer) === -1;
    }));

    allPeers.forEach(function(obj) {
      var existing = (typeof obj === 'object');
      if (existing) {
        self.peerRegistry.save(obj, function() {
          runPeer(obj);
        });
      } else {
        var peerData = {
          url: obj,
          direction: 'initiator'
        }; 
        self.peerRegistry.add(peerData, function(err, newPeer) {
          runPeer(newPeer);
        });
      }
      
      function runPeer(peer) {
        var peerClient = new PeerClient(peer.url, self);
        
        // when websocket is established
        peerClient.on('connecting', function() {
          peer.status = 'connecting';
          self.peerRegistry.save(peer);
        });
        
        // when peer handshake is made
        peerClient.on('connected', function() {
          peer.status = 'connected';
          self.peerRegistry.save(peer);
        });

        peerClient.on('error', function(error) {
          self.peerRegistry.get(peer.id, function(err, result) {
            result = JSON.parse(result);
            result.status = 'failed';
            result.error = error;
            self.peerRegistry.save(result);
          });
        });

        peerClient.on('closed', function(reconnect) {
          self.peerRegistry.get(peer.id, function(err, result) {
            result = JSON.parse(result);
            result.status = 'disconnected';
            self.peerRegistry.save(result, function() {
              peerClient.start();
            });
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
