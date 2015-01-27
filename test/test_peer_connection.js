var assert = require('assert');
var http = require('http');
var zetta = require('../zetta');
var MemRegistry = require('./fixture/mem_registry');
var MemPeerRegistry = require('./fixture/mem_peer_registry');

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
      
      cloudUrl = 'ws://0.0.0.0:' + cloud.httpServer.server.address().port;
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


  })

})
