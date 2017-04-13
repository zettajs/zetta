const assert = require('assert');
const http = require('http');
const urlParse = require('url').parse;
const WebSocket = require('ws');
const WebSocketServer = WebSocket.Server;
const request = require('supertest');
const util = require('util');
const Scout = require('../zetta_runtime').Scout;
const zetta = require('../zetta');
const mocks = require('./fixture/scout_test_mocks');
const MockRegistry = require('./fixture/mem_registry');
const PeerRegistry = require('./fixture/mem_peer_registry');
const GoodDevice = require('./fixture/example_driver');

const GoodScout = module.exports = function() {
  this.count = 0;
  this.interval = 5000;
  Scout.call(this);
};
util.inherits(GoodScout, Scout);

GoodScout.prototype.init = function(cb){
  const query = this.server.where({type:'test', vendorId:'1234567'});
  const self = this;
  this.server.find(query, (err, results) => {
    if(!err) {
      if(results.length) {
        self.provision(results[0], GoodDevice);
      }
    }
  });
  cb();
};

describe('Event Websocket', () => {
  let peerRegistry = null;
  let registry = null;
  let app = null;
  let deviceUrl = null;
  let deviceUrlHttp = null;
  let device = null;
  let port = null;

  beforeEach(done => {
    peerRegistry = new PeerRegistry();
    registry = new MockRegistry();
    registry.db.put('BC2832FD-9437-4473-A4A8-AC1D56B12C6F', {id:'BC2832FD-9437-4473-A4A8-AC1D56B12C6F',type:'test', vendorId:'1234567', foo:'foo', bar:'bar', name:'Test Device'}, {valueEncoding: 'json'}, err => {
      if (err) {
        done(err);
        return;
      }
      app = zetta({registry: registry, peerRegistry: peerRegistry});
      app.silent();
      app.name('BC2832FD-9437-4473-A4A8-AC1D56B12C61');
      app.use(GoodScout);
      app.listen(0, err => {
        port = app.httpServer.server.address().port;
        deviceUrl = `localhost:${port}/servers/BC2832FD-9437-4473-A4A8-AC1D56B12C61/events?topic=testdriver/BC2832FD-9437-4473-A4A8-AC1D56B12C6F`;
        deviceUrlHttp = `localhost:${port}/servers/BC2832FD-9437-4473-A4A8-AC1D56B12C61/devices/BC2832FD-9437-4473-A4A8-AC1D56B12C6F`;
        device = app.runtime._jsDevices['BC2832FD-9437-4473-A4A8-AC1D56B12C6F'];
        done(err);
      });
    });
  });

  afterEach(done => {
    app.httpServer.server.close();
    done();
  });


  describe('Basic Connection', function() {
    this.timeout(6000);
    it('http resource should exist with statusCode 200', done => {
      http.get(`http://${deviceUrlHttp}`, res => {
        assert.equal(res.statusCode, 200);
        done();
      }).on('error', done);
    });

    it('websocket should connect', done => {
      const url = `ws://${deviceUrl}/bar`;
      const socket = new WebSocket(url);

      socket.on('open', err => {
        socket.close();
        done();
      });
      socket.on('error', done);
    });

    it('will return a 404 on non ws urls', done => {
      const url = `ws://localhost:${port}/not-a-endpoint`;
      const socket = new WebSocket(url);
      socket.on('open', err => {
        done(new Error('Should not be open.'));
      });
      socket.on('error', err => {
        assert.equal(err.message, 'unexpected server response (404)');
        done();
      });
    });

    it('will return a 404 on non ws urls for /events123123', done => {
      const url = `ws://localhost:${port}/events123123`;
      const socket = new WebSocket(url);
      socket.on('open', err => {
        done(new Error('Should not be open.'));
      });
      socket.on('error', err => {
        assert.equal(err.message, 'unexpected server response (404)');
        done();
      });
    });


  });

  describe('Embedding a websocket server', function() {
    this.timeout(6000);
    let app = null;
    let port = null;
    let wss = null;
    
    beforeEach(done => {
      const peerRegistry = new PeerRegistry();
      const registry = new MockRegistry();
      app = zetta({registry: registry, peerRegistry: peerRegistry});
      app.silent();
      app.use(server => {
        var server = server.httpServer.server;
        wss = new WebSocketServer({server: server, path: '/foo'});  
      });
      app.listen(0, err => {
        port = app.httpServer.server.address().port;
        done(err);
      });
    });

    it('can connect to the custom server', done => {
      const ws = new WebSocket(`ws://localhost:${port}/foo`);  
      ws.on('open', function open() {
        done();  
      });
    });

    it('will fire the connection event on the server', done => {
      const ws = new WebSocket(`ws://localhost:${port}/foo`);  
      ws.on('open', function open() {
      });
      wss.on('connection', ws => {
        done();  
      });
    });
    
    it('can send data down the server websocket', done => {
      const ws = new WebSocket(`ws://localhost:${port}/foo`);  
      ws.on('open', function open() {
      });

      ws.on('message', () => {
        done();  
      });
      wss.on('connection', ws => {
        ws.send('foo');
      });
    });

    it('can send data up the server websocket', done => {
      const ws = new WebSocket(`ws://localhost:${port}/foo`);  
      wss.on('connection', ws => {
        ws.on('message', () => {
          done();  
        });  
      });

      ws.on('open', function open() {
        ws.send('foo');
      });
    });

    it('will return a 404 on non ws urls', done => {
      const url = `ws://localhost:${port}/not-a-endpoint`;
      const socket = new WebSocket(url);
      socket.on('open', err => {
        done(new Error('Should not be open.'));
      });
      socket.on('error', err => {
        assert.equal(err.message, 'unexpected server response (404)');
        done();
      });
    });

    afterEach(done => {
      app.httpServer.server.close();
      done();  
    }); 
  });

  describe('Receive json messages', () => {

    it('websocket should recv only one set of messages when reconnecting', done => {
      const url = `ws://${deviceUrl}/bar`;

      function openAndClose(cb) {
        const s1 = new WebSocket(url);
        s1.on('open', err => {
          s1.close();
          s1.on('close', () => {
            cb();
          });
        });
      }
      openAndClose(() => {
        const s2 = new WebSocket(url);
        s2.on('open', err => {
          s2.on('message', (buf, flags) => {
            done();
          });

          setTimeout(() => {
            device.incrementStreamValue();
          }, 20)
        });
      });

      return;
    });


    it('websocket should connect and recv data in json form', done => {
      const url = `ws://${deviceUrl}/bar`;
      const socket = new WebSocket(url);

      socket.on('open', err => {
        let recv = 0;
        socket.on('message', (buf, flags) => {
          const msg = JSON.parse(buf);
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

    it('websocket should connect and recv device log events from property API updates', done => {
      const url = `ws://${deviceUrl}/logs`;
      const socket = new WebSocket(url);
      socket.on('open', err => {
        deviceUrlHttp = `http://${deviceUrlHttp}`; 
        const parsed = urlParse(deviceUrlHttp); 
        const reqOpts = {
          hostname: 'localhost',
          port: parseInt(parsed.port),
          method: 'PUT',
          path: parsed.path,
          headers: {
            'Content-Type': 'application/json'  
          }  
        };

        const req = http.request(reqOpts);
        req.write(JSON.stringify({ fu: 'bar' }));
        req.end();
        let recv = 0;
        socket.on('message', (buf, flags) => {
          const msg = JSON.parse(buf);
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

    it('websocket should connect and recv device log events', done => {
      const url = `ws://${deviceUrl}/logs`;
      const socket = new WebSocket(url);

      socket.on('open', err => {
        let recv = 0;
        socket.on('message', (buf, flags) => {
          const msg = JSON.parse(buf);
          recv++;

          assert(msg.timestamp);
          assert(msg.topic);
          assert(msg.actions.filter(action => action.name === 'prepare').length > 0);

          assert.equal(msg.actions[0].href.replace('http://',''), deviceUrlHttp)

          if (recv === 1) {
            socket.close();
            done();
          }
        });

        device.call('change');
      });
    });

    it('websocket should recv connect and disconnect message for /peer-management', done => {
      const url = `ws://localhost:${port}/peer-management`;
      const socket = new WebSocket(url);
      let peer = null;
      
      socket.on('open', err => {
        socket.once('message', (buf, flags) => {
          const msg = JSON.parse(buf);
          assert.equal(msg.topic, '_peer/connect');
          assert(msg.timestamp);
          assert.equal(msg.data.id, 'some-peer');
          assert(msg.data.connectionId);
          assert.equal(Object.keys(msg).length, 3);

          socket.once('message', (buf, flags) => {
            const msg = JSON.parse(buf);
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
        peer.link(`http://localhost:${port}`);
        peer.listen(0);
      });
      socket.on('error', done);
    });
  });






  describe('Receive binary messages', () => {

    it('websocket should connect and recv data in binary form', done => {
      const url = `ws://${deviceUrl}/foobar`;
      const socket = new WebSocket(url);
      socket.on('open', err => {
        let recv = 0;
        socket.on('message', (buf, flags) => {
          assert(Buffer.isBuffer(buf));
          assert(flags.binary);
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
