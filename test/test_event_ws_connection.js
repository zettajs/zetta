var assert = require('assert');
var http = require('http');
var urlParse = require('url').parse;
var WebSocket = require('ws');
var WebSocketServer = WebSocket.Server;
var request = require('supertest');
var util = require('util');
var Scout = require('../zetta_runtime').Scout;
var zetta = require('../zetta');
var mocks = require('./fixture/scout_test_mocks');
var MockRegistry = require('./fixture/mem_registry');
var PeerRegistry = require('./fixture/mem_peer_registry');
var GoodDevice = require('./fixture/example_driver');

var GoodScout = module.exports = function() {
  this.count = 0;
  this.interval = 5000;
  Scout.call(this);
};
util.inherits(GoodScout, Scout);

GoodScout.prototype.init = function(cb){
  var query = this.server.where({type:'test', vendorId:'1234567'});
  var self = this;
  this.server.find(query, function(err, results){
    if(!err) {
      if(results.length) {
        self.provision(results[0], GoodDevice);
      }
    }
  });
  cb();
};

describe('Event Websocket', function() {
  var peerRegistry = null;
  var registry = null;
  var app = null;
  var deviceUrl = null;
  var deviceUrlHttp = null;
  var device = null;
  var port = null;

  beforeEach(function(done) {
    peerRegistry = new PeerRegistry();
    registry = new MockRegistry();
    registry.db.put('BC2832FD-9437-4473-A4A8-AC1D56B12C6F', {id:'BC2832FD-9437-4473-A4A8-AC1D56B12C6F',type:'test', vendorId:'1234567', foo:'foo', bar:'bar', name:'Test Device'}, {valueEncoding: 'json'}, function(err) {
      if (err) {
        done(err);
        return;
      }
      app = zetta({registry: registry, peerRegistry: peerRegistry});
      app.silent();
      app.name('BC2832FD-9437-4473-A4A8-AC1D56B12C61');
      app.use(GoodScout);
      app.listen(0, function(err){
        port = app.httpServer.server.address().port;
        deviceUrl = 'localhost:' + port + '/servers/BC2832FD-9437-4473-A4A8-AC1D56B12C61/events?topic=testdriver/BC2832FD-9437-4473-A4A8-AC1D56B12C6F';
        deviceUrlHttp = 'localhost:' + port + '/servers/BC2832FD-9437-4473-A4A8-AC1D56B12C61/devices/BC2832FD-9437-4473-A4A8-AC1D56B12C6F';
        device = app.runtime._jsDevices['BC2832FD-9437-4473-A4A8-AC1D56B12C6F'];
        done(err);
      });
    });
  });

  afterEach(function(done) {
    app.httpServer.server.close();
    done();
  });


  describe('Basic Connection', function() {
    this.timeout(6000);
    it('http resource should exist with statusCode 200', function(done) {
      http.get('http://'+deviceUrlHttp, function(res) {
        assert.equal(res.statusCode, 200);
        done();
      }).on('error', done);
    });

    it('websocket should connect', function(done) {
      var url = 'ws://' + deviceUrl + '/bar';
      var socket = new WebSocket(url);

      socket.on('open', function(err) {
        socket.close();
        done();
      });
      socket.on('error', done);
    });

    it('will return a 404 on non ws urls', function(done) {
      var url = 'ws://localhost:' + port + '/not-a-endpoint';
      var socket = new WebSocket(url);
      socket.on('open', function(err) {
        done(new Error('Should not be open.'));
      });
      socket.on('error', function(err) {
        assert.equal(err.message, 'unexpected server response (404)');
        done();
      });
    });

    // Returning 400 instead of 404.
    it('will return a 404 on non ws urls for /events123123', function(done) {
      var url = 'ws://localhost:' + port + '/events123123';
      var socket = new WebSocket(url);
      socket.on('open', function(err) {
        done(new Error('Should not be open.'));
      });
      socket.on('error', function(err) {
        assert.equal(err.message, 'unexpected server response (404)');
        done();
      });
    });


  });

  describe('Embedding a websocket server', function() {
    this.timeout(6000);
    var app = null;
    var port = null;
    var wss = null;
    
    beforeEach(function(done) {
      var peerRegistry = new PeerRegistry();
      var registry = new MockRegistry();
      app = zetta({registry: registry, peerRegistry: peerRegistry});
      app.silent();
      app.use(function(server) {
        var server = server.httpServer.server;
        wss = new WebSocketServer({server: server, path: '/foo'});  
      });
      app.listen(0, function(err){
        port = app.httpServer.server.address().port;
        done(err);
      });
    });

    it('can connect to the custom server', function(done) {
      var ws = new WebSocket('ws://localhost:'+port+'/foo');  
      ws.on('open', function open() {
        done();  
      });
    });

    it('will fire the connection event on the server', function(done) {
      var ws = new WebSocket('ws://localhost:'+port+'/foo');  
      ws.on('open', function open() {
      });
      wss.on('connection', function(ws) {
        done();  
      });
    });
    
    it('can send data down the server websocket', function(done) {
      var ws = new WebSocket('ws://localhost:'+port+'/foo');  
      ws.on('open', function open() {
      });

      ws.on('message', function() {
        done();  
      });
      wss.on('connection', function(ws) {
        ws.send('foo');
      });
    });

    it('can send data up the server websocket', function(done) {
      var ws = new WebSocket('ws://localhost:'+port+'/foo');  
      wss.on('connection', function(ws) {
        ws.on('message', function() {
          done();  
        });  
      });

      ws.on('open', function open() {
        ws.send('foo');
      });
    });

    // This is now a 400 retrunred by ws. See:
    // https://github.com/websockets/ws/blob/b9fad73f53c786bffc831e4cc7740da83b82f23b/lib/websocket-server.js#L189
    it('will return a 400 on non ws urls', function(done) {
      var url = 'ws://localhost:' + port + '/not-a-endpoint';
      var socket = new WebSocket(url);
      socket.on('open', function(err) {
        done(new Error('Should not be open.'));
      });
      socket.on('error', function(err) {
        assert.equal(err.message, 'unexpected server response (400)');
        done();
      });
    });

    afterEach(function(done) {
      app.httpServer.server.close();
      done();  
    }); 
  });

  describe('Receive json messages', function() {

    it('websocket should recv only one set of messages when reconnecting', function(done) {
      var url = 'ws://' + deviceUrl + '/bar';

      function openAndClose(cb) {
        var s1 = new WebSocket(url);
        s1.on('open', function(err) {
          s1.close();
          s1.on('close', function(){
            cb();
          });
        });
      }
      openAndClose(function(){
        var s2 = new WebSocket(url);
        s2.on('open', function(err) {
          s2.on('message', function(buf, flags) {
            done();
          });

          setTimeout(function(){
            device.incrementStreamValue();
          }, 20)
        });
      });

      return;
    });


    it('websocket should connect and recv data in json form', function(done) {
      var url = 'ws://' + deviceUrl + '/bar';
      var socket = new WebSocket(url);

      socket.on('open', function(err) {
        var recv = 0;
        socket.on('message', function(buf, flags) {
          var msg = JSON.parse(buf);
          recv++;
          assert(msg.timestamp);
          assert(msg.topic);
          assert.equal(msg.data, recv);
          if (recv === 3) {
            socket.close();
            done();
          }
        });

        device.incrementStreamValue();
        device.incrementStreamValue();
        device.incrementStreamValue();
      });
      socket.on('error', done);
    });

    it('websocket should connect and recv device log events from property API updates', function(done) {
      var url = 'ws://' + deviceUrl + '/logs';
      var socket = new WebSocket(url);
      socket.on('open', function(err) {
        deviceUrlHttp = 'http://' + deviceUrlHttp; 
        var parsed = urlParse(deviceUrlHttp); 
        var reqOpts = {
          hostname: 'localhost',
          port: parseInt(parsed.port),
          method: 'PUT',
          path: parsed.path,
          headers: {
            'Content-Type': 'application/json'  
          }  
        }

        var req = http.request(reqOpts);
        req.write(JSON.stringify({ fu: 'bar' }));
        req.end();
        var recv = 0;
        socket.on('message', function(buf, flags) {
          var msg = JSON.parse(buf);
          recv++;
          assert(msg.timestamp);
          assert(msg.topic);
          assert.equal(msg.transition, 'zetta-properties-update');
          assert.equal(msg.properties.fu, 'bar');
          assert.equal(msg.properties.foo, 0);

          if (recv === 1) {
            socket.close();
            done();
          }
        });
      });
      socket.on('error', done);
    });

    it('websocket should connect and recv device log events', function(done) {
      var url = 'ws://' + deviceUrl + '/logs';
      var socket = new WebSocket(url);

      socket.on('open', function(err) {
        var recv = 0;
        socket.on('message', function(buf, flags) {
          var msg = JSON.parse(buf);
          recv++;

          assert(msg.timestamp);
          assert(msg.topic);
          assert(msg.actions.filter(function(action) {
            return action.name === 'prepare';
          }).length > 0);

          assert.equal(msg.actions[0].href.replace('http://',''), deviceUrlHttp)

          if (recv === 1) {
            socket.close();
            done();
          }
        });

        device.call('change');
      });
    });

    it('websocket should recv connect and disconnect message for /peer-management', function(done) {
      var url = 'ws://localhost:' + port + '/peer-management';
      var socket = new WebSocket(url);
      var peer = null;
      
      socket.on('open', function(err) {
        socket.once('message', function(buf, flags) {
          var msg = JSON.parse(buf);
          assert.equal(msg.topic, '_peer/connect');
          assert(msg.timestamp);
          assert.equal(msg.data.id, 'some-peer');
          assert(msg.data.connectionId);
          assert.equal(Object.keys(msg).length, 3);

          socket.once('message', function(buf, flags) {
            var msg = JSON.parse(buf);
            assert.equal(msg.topic, '_peer/disconnect');
            assert(msg.timestamp);
            assert.equal(msg.data.id, 'some-peer');
            assert(msg.data.connectionId);
            assert.equal(Object.keys(msg).length, 3);
            done();
          });

          // disconnect
          peer._peerClients[0].close();
        });
        peer = zetta({registry: new MockRegistry(), peerRegistry: new PeerRegistry() });
        peer.name('some-peer');
        peer.silent();
        peer.link('http://localhost:' + port);
        peer.listen(0);
      });
      socket.on('error', done);
    });
  });






  describe('Receive binary messages', function() {
    it('websocket should connect and recv data in binary form', function(done) {
      var url = 'ws://' + deviceUrl + '/foobar';
      var socket = new WebSocket(url);
      socket.on('open', function(err) {
        var recv = 0;
        socket.on('message', function(buf, flags) {
          assert(Buffer.isBuffer(buf));
          recv++;
          assert.equal(buf[0], recv);
          if (recv === 3) {
            socket.close();
            done();
          }
        });

        device.incrementFooBar();
        device.incrementFooBar();
        device.incrementFooBar();
      });
      socket.on('error', done);
    });

  });



});
