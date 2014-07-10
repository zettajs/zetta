var os = require('os');
var uuid = require('node-uuid');
var async = require('async');
var scientist = require('./lib/scientist');
var Runtime = require('./lib/runtime');
var HttpServer = require('./lib/http_server');
var PeerClient = require('./lib/peer_client');
var PeerRegistry = require('./lib/peer_registry');

module.exports = function(){
  var args = Array.prototype.concat.apply([Zetta], arguments);
  return scientist.create.apply(null, args);
};

var Zetta = function(opts) {
  opts = opts || {};

  this.id = uuid.v4(); // unique id of server
  this._name = os.hostname(); // optional name, defaults to OS hostname

  this._exposeQuery = '';
  this._scouts = [];
  this._apps = [];
  this._peers = [];

  this.peerRegistry = opts.peerRegistry || new PeerRegistry();

  if(opts && opts.registry) {
    this.runtime = new Runtime({registry: opts.registry});
  } else {
    this.runtime = new Runtime();
  }

  this.httpServer = new HttpServer(this);
  
};

Zetta.prototype.name = function(name) {
  this._name = name;
  return this;
};

Zetta.prototype.use = function() {
  var scout = scientist.create.apply(null, arguments);
  scout.server = this.runtime;
  this._scouts.push(scout);
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
      self._initApps(next);
    },
    function(next) {
      self._initScouts(next);
    },
    function(next) {
      self._initHttpServer(next);
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

Zetta.prototype._initPeers = function(callback) {
  var self = this;
  var existingUrls = [];

  this.peerRegistry.find({ match: function() { return true; } }, function(err, results) {
    results.forEach(function(peer) {
      peer.status = 'disconnected';
      if (peer.direction === 'in' && peer.url) {
        var client = new PeerClient(peer.url, self);
        peer.status = 'connecting'
        self.peerRegistry.save(peer, function() {
          client.on('connected', function() {
            peer.status = 'connected';
            self.peerRegistry.save(peer);
          });

          client.start();
        });
        existingUrls.push(peer.url);
      }
    });

    self._peers.filter(function(peer) {
      return existingUrls.indexOf(peer) === -1;
    })
    .forEach(function(peerUrl) {
      var peerData = {
        url: peerUrl,
        direction: 'in'
      }; 

      self.peerRegistry.add(peerData, function(err, newPeer) {
        var peerClient = new PeerClient(peerUrl, self);
        peerClient.on('connected', function() {
          newPeer.status = 'connected';
          peerRegistry.save(newPeer);
        });

        peerClient.start();
      });

    });

    callback();
  });

  return this;
};
