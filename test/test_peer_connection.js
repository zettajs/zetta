var assert = require('assert');
var http = require('http');
var util = require('util');
var net = require('net');
var EventEmitter = require('events').EventEmitter;
var zetta = require('../zetta');
var MemRegistry = require('./fixture/mem_registry');
var MemPeerRegistry = require('./fixture/mem_peer_registry');
var PeerSocket = require('../lib/peer_socket');

var Ws = function() {
  EventEmitter.call(this)
  this._socket = new net.Socket();
  this.upgradeReq = { url: '/peers/0ac7e9c2-f03f-478c-95f5-2028fc9c2b6e?connectionId=46f466b0-1017-430b-8993-d7a8c896e014'};
};
util.inherits(Ws, EventEmitter);
Ws.prototype.close = function() {};
Ws.prototype.send = function(data, options, cb) {
  var r = this.emit('onsend', data, options, cb);
};


describe('Peer Connection Logic', function() {
  var cloud = null;
  var cloudUrl = null;
  beforeEach(function(done) {
    cloud = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
    cloud.silent();
    cloud.listen(0, function(err) {
      if (err) {
        return done(err);
      }
      
      cloudUrl = 'ws://localhost:' + cloud.httpServer.server.address().port;
      done();
    })
  });

  afterEach(function(done) {
    cloud.httpServer.server.close();
    done();
  });

  describe('#link', function() {
    it('should work before .listen is ran', function(done) {
      var z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() })
        .silent()
        .link(cloudUrl)
        .listen(0);
      
      z.pubsub.subscribe('_peer/connect', function(topic, data) {
        if (data.peer.url.indexOf(cloudUrl) === 0) {
          done();
        } else {
          done(new Error('Peer connected to another url then expected'))
        }
      })
    })

    it('should work after .listen is ran', function(done) {
      var z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() })
        .silent()
        .listen(0, function() {
          z.link(cloudUrl);
        });
      
      z.pubsub.subscribe('_peer/connect', function(topic, data) {
        if (data.peer.url.indexOf(cloudUrl) === 0) {
          done();
        } else {
          done(new Error('Peer connected to another url then expected'))
        }
      })
    })

    it('should wire up request extensions', function(done) {
      var z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() })
        .silent()
        .use(function(server) {
          server.onPeerRequest(function(client) {
            return client
              .use(function(handle) {
                handle('request', function(pipeline) {
                  return pipeline.map(function(env) {
                    assert(env.request);
                    done();
                    return env;
                  });
                });
              });
          });
        })
        .link(cloudUrl)
        .listen(0);
    });

    it('should wire up response extensions', function(done) {
      var z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() })
        .silent()
        .use(function(server) {
          server.onPeerResponse(function(request) {
            return request
              .map(function(env) {
                assert(env.request);
                assert(env.response);
                assert(env.upgrade);
                done();
                return env;
              });
          });
        })
        .link(cloudUrl)
        .listen(0);
    });
  })

  describe('Handle spdy agent errors', function() {
    it('should catch error event', function(done) {
      var ws = new Ws();
      var socket = new PeerSocket(ws, 'some-peer', new MemPeerRegistry);
      socket.on('error', function(err) {
        done();
      });
      socket.agent.emit('error', new Error(''));
    });
  })

})
