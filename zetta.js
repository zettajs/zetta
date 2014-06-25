var uuid = require('node-uuid');
var async = require('async');
var scientist = require('./lib/scientist');
var Runtime = require('./lib/runtime');
var HttpServer = require('./lib/http_server');
var PeerClient = require('./lib/peer_client');

module.exports = function(){
  var args = Array.prototype.concat.apply([Zetta], arguments);
  return scientist.create.apply(null, args)
};

var Zetta = function() {
  this.id = uuid.v4(); // unique id of server
  this.name = null; // optional name

  this._exposeQuery = '';
  this._scouts = [];
  this._apps = [];
  this._peers = [];

  // runtime instance
  this.runtime = new Runtime();

  this.httpServer = new HttpServer();

};

Zetta.prototype.name = function(name) {
  this.name = name;
};

Zetta.prototype.use = function() {
  var scout = scientist.create.apply(null, arguments);
  scout.server = this.runtime;
  this._scouts.push(scout);
};

Zetta.prototype.expose = function(query) {
  this._exposeQuery = query;
};

Zetta.prototype.load = function(app) {
  this._apps.push(app);
};

Zetta.prototype.link = function(peers) {
  var self = this;
  if(!Array.isArray(peers)) {
    peers = [peers];
  }
  
  peers.forEach(function(peer) {
    self._peers.push(new PeerClient(peer, self.httpServer));
  });
};

Zetta.prototype.listen = function(port, callback) {
  var self = this;

  async.series([
    function(next) {
      self._initScouts(next);
    },
    function(next) {
      self._initApps(next);
    },
    function(next) {
      var args = Array.prototype.slice.apply(arguments, 0);
      args.pop();
      args.push(next);
      self._initHttpServer.apply(self, args);
    },
    function(next) {
      self._initPeers(next);
    }
  ], callback);

};

Zetta.prototype._initScouts = function(callback) {
  async.each(this._scouts, function(scout, next) {
    scout.init(next);
  }, function(err) {
    callback(err);
  });
};

Zetta.prototype._initApps = function(callback) {
  var self = this;
  this._apps.forEach(function(app) {
    app(self.runtime);
  });
  
  callback();
};

Zetta.prototype._initHttpServer = function() {
  this.httpServer.listen.apply(this.httpServer, arguments);
};

Zetta.prototype._initPeers = function(callback) {
  this._peers.forEach(function(peer) {
    peer.start();
  });
  callback();
};

