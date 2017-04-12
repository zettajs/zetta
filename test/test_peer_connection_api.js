var assert = require('assert');
var http = require('http');
var zetta = require('../zetta');
var MemRegistry = require('./fixture/mem_registry');
var MemPeerRegistry = require('./fixture/mem_peer_registry');
var request = require('supertest');
var PeerRegistry = require('../lib/peer_registry');
var Query = require('calypso').Query;
var querystring = require('querystring');

function deleteRequest(port, connectionId) {
  var opts = {
    host: 'localhost',
    port: port,
    method: 'DELETE',
    path: '/peer-management/' + connectionId
  }
  
  var req = http.request(opts);
  req.end(); 
}

function putRequest(port, connectionId, url) {
  var qs = {
    url: url  
  };
  var string = querystring.stringify(qs);
  var opts = {
    host: 'localhost',
    port: port,
    method: 'PUT',
    path: '/peer-management/' + connectionId,
    headers: {
      'Content-Length': string.length  
    }
  };

  var req = http.request(opts);
  req.write(string);
  req.end();
}


function getHttpServer(app) {
  return app.httpServer.server;
}

function getBody(fn) {
  return function(res) {
    try {
      if(res.text) {
        var body = JSON.parse(res.text);
      } else {
        var body = '';
      }
    } catch(err) {
      throw new Error('Failed to parse json body');  
    }

    fn(res, body);
  }
}

describe('Peer Connection API', function() {
  describe('/peer-management embedded entities', function() {
    var peerRegistry = null;
    var app = null;

    beforeEach(function(done) {
      peerRegistry = new MemPeerRegistry();
      app = zetta({ registry: new MemRegistry(), peerRegistry: peerRegistry })
        .silent()
        .name('local')
        ._run(done);
    });
    
    checkPeersActionsForState('initiator', 'connected', 2);
    checkPeersActionsForState('initiator', 'disconnected', 2);
    checkPeersActionsForState('acceptor', 'connected', 2);
    checkPeersActionsForState('acceptor', 'disconnected', 0);
    
    function checkPeersActionsForState(direction, status, numberOfActionsExpected) {
      it('exposes ' + numberOfActionsExpected + ' actions on the embedded entity when ' + status + ' and ' + direction, function(done) {

        var peer = {
          id:'foo',
          connectionId:'12345',
          direction: direction,
          status: status
        };
        
        peerRegistry.save(peer, function() {
          var url = '/peer-management';
          request(getHttpServer(app))
            .get(url)
            .expect(getBody(function(res, body) {
              assert.equal(body.entities.length, 1);
              assert.equal(body.entities[0].actions.length, numberOfActionsExpected);
              body.entities[0].actions.forEach(function(action) {
                assert.ok(action.href.indexOf('/peer-management/12345') !== -1);
              })
            }))
            .end(done);
        });
      });
    }

    checkPeersActionsOnFullEntity('initiator', 'connected', 2);
    checkPeersActionsOnFullEntity('initiator', 'disconnected', 2);
    checkPeersActionsOnFullEntity('acceptor', 'connected', 2);
    checkPeersActionsOnFullEntity('acceptor', 'disconnected', 0);
    
    function checkPeersActionsOnFullEntity(direction, status, numberOfActionsExpected) {
      it('when ' + direction + ' exposes ' + numberOfActionsExpected + ' actions on the full entity when ' + status, function(done) {
        var peer = {
          id:'foo',
          connectionId:'12345',
          direction: direction,
          status: status
        };
        peerRegistry.save(peer, function() {
          var url = '/peer-management/foo';
          request(getHttpServer(app))
            .get(url)
            .expect(getBody(function(res, body) {
              assert.equal(body.actions.length, numberOfActionsExpected);
              body.actions.forEach(function(action) {
                assert.ok(action.href.indexOf('/peer-management/12345') !== -1);
              });
            }))
            .end(done);
        });
      }); 
    }
  }); 

  describe('Root API for peers', function() {
    var cloud = null;
    var cloudUrl = null;
    var cloudPort = null;
    var db1 = null;
    var db2 = null;

    beforeEach(function(done) {
      
      cloud = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
      cloud.name('cloud');
      cloud.silent();
      
      cloud.listen(0, function(err) {
        if(err) {
          return done(err);
        }
        
        cloudPort = cloud.httpServer.server.address().port;
        cloudUrl = 'http://localhost:' + cloudPort;
        done();  
      });  
    });

    afterEach(function(done) {
      cloud.httpServer.server.close();
      done();
    });

    it('will have rel of server on peer', function(done) {
      this.timeout(10000);
      var connected = false;
      var z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
      z.name('local');

      cloud.pubsub.subscribe('_peer/connect', function(topic, data) {
        setImmediate(function() {
          var url = '/';
          request(getHttpServer(cloud))
            .get(url)
            .expect(getBody(function(res, body) {
              var peerLinks = body.links.filter(function(link) { return link.rel.indexOf('http://rels.zettajs.io/peer') !== -1; });
              var peerLink = peerLinks[0];
              assert.ok(peerLink.rel.indexOf('http://rels.zettajs.io/server') !== -1);
            }))
            .end(done); 
        });
      });

      z.silent();
      z.link(cloudUrl);
      z.listen(0);

       
    });  
    
  });

  describe('/peer-management disconnection API', function() {
    var cloud = null;
    var cloudUrl = null;
    var cloudPort = null;
    var db1 = null;
    var db2 = null;

    beforeEach(function(done) {
      
      cloud = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
      cloud.name('cloud');
      cloud.silent();
      
      cloud.listen(0, function(err) {
        if(err) {
          return done(err);
        }
        
        cloudPort = cloud.httpServer.server.address().port;
        cloudUrl = 'http://localhost:' + cloudPort;
        done();  
      });  
    });

    afterEach(function(done) {
      cloud.httpServer.server.close();
      done();
    });

    it('will return 404 if connection does not exist', function(done) {
      var url = '/peer-management/1234';
      request(getHttpServer(cloud))
        .del(url)
        .expect(404, done);
    });

    it('will proxy a disconnection between two peers', function(done) {
      //Had to increase the timeout. The standard two seconds may not be long enough for a connection to be established.
      this.timeout(10000);
      var connected = false;
      var z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
      z.name('local');
      var connectionId = null;

      z.pubsub.subscribe('_peer/disconnect', function(topic, data) {
        assert.equal(connectionId, data.peer.connectionId);
        done();
      });

      cloud.pubsub.subscribe('_peer/connect', function(topic, data) {
        assert.equal(connected, true);
        connectionId = data.peer.connectionId;
        deleteRequest(cloudPort, connectionId);
      });
      z.pubsub.subscribe('_peer/connect', function(topic, data) {
        connected = true; 
      });
        
      z.silent();
      z.link(cloudUrl);
      z.listen(0); 

      
    });
    
    it('will disconnect two peers', function(done) {
      this.timeout(10000);
      var connected = false;
      var localPort = null;
      var z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
      z.name('local');
      
      var connectionId = null;
      
      z.pubsub.subscribe('_peer/disconnect', function(topic, data) {
        assert.equal(connectionId, data.peer.connectionId);
        done();  
      });  

      cloud.pubsub.subscribe('_peer/connect', function(topic, data) {
        assert.equal(connected, true);
        connectionId = data.peer.connectionId;
        deleteRequest(localPort, connectionId);  
      });

      z.pubsub.subscribe('_peer/connect', function(topic, data) {
        connected = true;  
      });

      z.silent();
      z.link(cloudUrl);
      z.listen(0, function(err) {
        if(err) {
          done(err);  
        }

        localPort = z.httpServer.server.address().port;
      });

    });  
  });

  describe('/peer-management update API', function() {
    var cloud = null;
    var localOne = null;
    var localPort = null;
    var cloudPort = null;
    var localOnePort = null;
    var connectionId = null;


    beforeEach(function(done) {
      this.timeout(10000);
      cloud = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
      cloud.name('cloud');
      cloud.silent();
      
      localOne = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
      localOne.name('localOne');
      localOne.silent();
      
      cloud.pubsub.subscribe('_peer/connect', function(topic, data) {
        connectionId = data.peer.connectionId;  
        done();
      });
       
      cloud.listen(0, function(err) {
        if(err) {
          return done(err);
        }
        
        cloudPort = cloud.httpServer.server.address().port;
        var cloudUrl = 'http://localhost:' + cloudPort;

        localOne.link(cloudUrl);
        localOne.listen(0, function(err) {
          if(err) {
            done(err);  
          }  

          localPort = localOne.httpServer.server.address().port;
        });
      });    
    });

    afterEach(function(done) {
      cloud.httpServer.server.close();
      localOne.httpServer.server.close();
      done();  
    });
    
    it('will return 404 if connection does not exist', function(done) {
      var url = '/peer-management/1234';
      request(getHttpServer(cloud))
        .put(url)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send({ url: 'http://localhost:1234' })
        .expect(404, done);
    });

    it('will proxy a connection update between two peers', function(done) {
      this.timeout(10000);
      var localTwoPort = null;
      var localTwo = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
      localTwo.name('localTwo');
      localTwo.silent();

      var url = 'http://localhost:';

      cloud.pubsub.subscribe('_peer/disconnect', function(topic, data) {
        assert.equal(connectionId, data.peer.connectionId); 
      }); 

      localTwo.pubsub.subscribe('_peer/connect', function(topic, data) {
        done();
      });

      localTwo.listen(0, function(err) {
        if(err) {
          return done(err);  
        }  

        localTwoPort = localTwo.httpServer.server.address().port;
        var serverUrl = url + localTwoPort;
        putRequest(cloudPort, connectionId, serverUrl);
      });
    });

    it('will update a connection between two peers', function(done) {
      this.timeout(10000);
      var localTwoPort = null;
      var localTwo = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
      localTwo.name('localTwo');
      localTwo.silent();

      var url = 'http://localhost:';
      var serverUrl = null;
      cloud.pubsub.subscribe('_peer/disconnect', function(topic, data) {
        assert.equal(connectionId, data.peer.connectionId); 
      }); 

      localTwo.pubsub.subscribe('_peer/connect', function(topic, data) {
        // make sure there is only one peer in /peer-management list
        // PUT Should not add a new peer
        request(getHttpServer(localOne))
          .get('/peer-management')
          .expect(200)
          .expect(getBody(function(res, body) {
            assert.equal(body.entities.length, 1);
            // url should be updated to new peer
            assert.equal(body.entities[0].properties.url, serverUrl);
          }))
          .end(done);
      });

      localTwo.listen(0, function(err) {
        if(err) {
          done(err);  
        }  

        localTwoPort = localTwo.httpServer.server.address().port;
        serverUrl = url + localTwoPort;
        putRequest(localPort, connectionId, serverUrl);
      });  
    });  
  });
});
