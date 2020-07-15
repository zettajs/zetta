var assert = require('assert');
var http = require('http');
var util = require('util');
var net = require('net');
var EventEmitter = require('events').EventEmitter;
var zetta = require('../zetta');
var MemRegistry = require('./fixture/mem_registry');
var MemPeerRegistry = require('./fixture/mem_peer_registry');
var PeerSocket = require('../lib/peer_socket');
var PeerClient = require('../lib/peer_client');

function getMocks() {
  var Ws = function() {
    EventEmitter.call(this)
    this._socket = new net.Socket();
  };
  util.inherits(Ws, EventEmitter);
  Ws.prototype.send = function(data, options, cb) {};
  Ws.prototype.close = function() {};

  return {
    ws: new Ws(),
    req: {
      url: '/peers/0ac7e9c2-f03f-478c-95f5-2028fc9c2b6e?connectionId=46f466b0-1017-430b-8993-d7a8c896e014',
      headers: {}
    }
  }
}

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
      var called = false;
      var z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() })
        .silent()
        .use(function(server) {
          server.onPeerRequest(function(client) {
            client
              .use(function(handle) {
                handle('request', function(pipeline) {
                  return pipeline.map(function(env) {
                    assert(env.request);
                    if (!called) {
                      called = true;
                      done();
                    }
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

  // TODO(adammagaluk): Failing after test completes.
  describe.skip('Handle spdy agent errors', function() {
    it('should catch error event', function(done) {
      var mocks = getMocks();
      var socket = new PeerSocket(mocks.ws, mocks.req, 'some-peer', new MemPeerRegistry);
      socket.on('error', function(err) {
        if (err.message === 'spdy-error') {
          done();
        }
      });
      socket.agent.emit('error', new Error('spdy-error'));
    });
  })

  describe('Peer_socket error events', function() {

    it('http-server should handle multiple error events', function(done) {
      var z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() })
        .name('test-peer')
        .silent()
        .link(cloudUrl)
        .listen(0);

      var onConnect = function(topic, data) {
        cloud.pubsub.unsubscribe('_peer/connect', onConnect);
        assert(cloud.httpServer.peers['test-peer']);
        cloud.pubsub.subscribe('_peer/disconnect', onDisconnect);
        var peer = cloud.httpServer.peers['test-peer'];
        peer.emit('error', new Error('some error'));
        peer.emit('error', new Error('some error'));
      };

      var onDisconnect = function(topic, data) {
        assert.equal(data.peer.state, PeerSocket.DISCONNECTED);
        cloud.pubsub.unsubscribe('_peer/disconnect', onDisconnect);
        done();
      };

      cloud.pubsub.subscribe('_peer/connect', onConnect);
    });


    it('http-server should handle multiple end events', function(done) {
      var z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() })
        .name('test-peer')
        .silent()
        .link(cloudUrl)
        .listen(0);
      
      var onConnect =  function(topic, data) {
        assert(cloud.httpServer.peers['test-peer']);
        cloud.pubsub.unsubscribe('_peer/connect', onConnect);
        cloud.pubsub.subscribe('_peer/disconnect', onDisconnect);
        var peer = cloud.httpServer.peers['test-peer'];
        peer.emit('end');
        peer.emit('end');
      };

      var onDisconnect = function(topic, data) {
        assert.equal(data.peer.state, PeerSocket.DISCONNECTED);
        cloud.pubsub.unsubscribe('_peer/disconnect', onDisconnect);
        done();
      }
      
      cloud.pubsub.subscribe('_peer/connect', onConnect)
    });

  });

  describe('Handle timings with ws connects vs actual peer connects', function() {
    var hub = null;
    beforeEach(function(done) {
      hub = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() })
        .name('peer-1')
        .silent()
        .listen(0, done);
    })

    afterEach(function(done) {
      hub.httpServer.server.close();
      done();
    })

    it('peer connects should be the same peer object on the cloud', function(done) {
      var client = new PeerClient(cloudUrl, hub);

      cloud.pubsub.subscribe('_peer/connect', function(topic, data) {
        assert(data.peer === cloud.httpServer.peers['peer-1']);
        done();
      });

      client.start();
    })

    it('peer connects should be the same peer object on the cloud with reconnect', function(done) {
      var client = new PeerClient(cloudUrl, hub);

      var count = 0;
      cloud.pubsub.subscribe('_peer/connect', function(topic, data) {
        count++;
        assert(data.peer === cloud.httpServer.peers['peer-1']);
        if (count === 2) {
          return done();
        }
        cloud.httpServer.peers['peer-1'].close();
      });
      client.start();
    });

    it('peer connects should be the same peer object on the cloud with reconnect with timing issue', function(done) {
      this.timeout(5000);
      var client = new PeerClient(cloudUrl, hub);

      var lastPeer = null;
      var count = 0;
      cloud.pubsub.subscribe('_peer/connect', function(topic, data) {
        count++;
        assert(data.peer === cloud.httpServer.peers['peer-1']);
        if (count === 1) {
          lastPeer = data.peer;
          cloud.httpServer.peers['peer-1'].close();

          client.once('connecting', function() {
            var origRequest = client.onRequest;
            client.server.removeListener('request', client.onRequest);
            client.onRequest = function(req, res) {
              client.ws.close();
            };
            client.server.once('request', client.onRequest.bind(client));
          })

        } else if (count === 2) {
          assert(data.peer === lastPeer, 'a new PeerSocket on the cloud was created instead of a reuse');
          done();
        }
      });
      client.start();
    });


  });

})
