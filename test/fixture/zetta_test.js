var async = require('async');
var zetta = require('../../zetta');
var MemRegistry = require('./mem_registry');
var MemPeerRegistry = require('./mem_peer_registry');
var portscanner = require('./portscanner');
var Query = require('calypso').Query;

module.exports = function(opts) {
  return new ZettaTest(opts);
};

var ZettaTest = function(opts) {
  opts = opts || {};
  this.startPort = opts.startPort || Math.floor(2000 + Math.random() * 60000);
  this._nextPort = this.startPort;
  this.servers = {};
  this.RegType = opts.Registry || MemRegistry;
  this.PeerRegType = opts.PeerRegistry || MemPeerRegistry;
  this._serversUrl = {};
};

ZettaTest.prototype.registry = function(Type) {
  this.RegType = Type;
  return this;
};

ZettaTest.prototype.peerRegistry = function(Type) {
  this.PeerRegType = Type;
  return this;
};

ZettaTest.prototype.server = function(name, scouts, peers) {
  var reg = new this.RegType();
  var peerRegistry = new this.PeerRegType();
  var server = zetta({ registry: reg, peerRegistry: peerRegistry });
  server.silent();
  server.name(name);
  server.expose('*');
  if (scouts) {
    scouts.forEach(function(Scout) {
      server.use(Scout);
    });
  }

  server.locatePeer = function(id) {
    return encodeURI(id);
  };
 
  server._testPeers = peers || [];
//  server._testPort = this._nextPort++;
  this.servers[name] = server;
  return this;
};

ZettaTest.prototype.stop = function(callback) {
  var self = this;
  Object.keys(this.servers).forEach(function(key) {
    var server = self.servers[key];
    server.httpServer.server.close();
  });
};

ZettaTest.prototype.run = function(callback) {
  var self = this;
  this.assignPorts(function(err) {
    if (err) {
      return callback(err);
    }

    Object.keys(self.servers).forEach(function(key) {
      var server = self.servers[key];
      server._testPeers.forEach(function(peerName) {
        if (!self.servers[peerName]) {
          return;
        }

        var url = 'http://localhost:' + self.servers[peerName]._testPort;
        self._serversUrl[url] = self.servers[peerName];
        server.link(url);
      });
    });
    
    async.each( Object.keys(self.servers), function(name, next) {
      var server = self.servers[name];
      server.listen(server._testPort, function(err) {
        if (err) {
          return next(err);
        }
        function check(done) {
          var allQuery = Query.of('peers');
          var ret = true;
          server.peerRegistry.find(allQuery, function(err, results) {
            results.forEach(function(peer) {
              if (!peer.status || peer.status !== 'connected') {
                ret = false;
                return;
              }

              var pServer = self._serversUrl[peer.url];
              if (!pServer.httpServer.peers[name]) {
                ret = false;
              }
            });
            done(ret);
          });
        }


        async.forever(
          function(next) {
            check(function(ready){
              if (ready) {
                return next(new Error(''));
              } else {
                return next();
              }
            });
          },
          function(err) {
            next();
          }
        );
      });
    }, callback);

  });

  return this;
};

ZettaTest.prototype.assignPorts = function(cb) {
  var self = this;
  var obj = { count: Object.keys(this.servers).length };
  if (this.startPort) {
    obj.startingPort = this.startPort;
  }
  
  portscanner(obj, function(err, ports) {
    if (err) {
      return cb(err);
    }
    
    if (typeof ports === 'number') {
      ports = [ports];
    }

    Object.keys(self.servers).forEach(function(key, i) {
      self.servers[key]._testPort = ports[i];
    });
    
    cb();
  });
};



