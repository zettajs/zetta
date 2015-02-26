var assert = require('assert');
var http = require('http');
var WebSocket = require('ws');
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
      app.id = 'BC2832FD-9437-4473-A4A8-AC1D56B12C61';
      app.use(GoodScout)
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

    it('http resource should exist with statusCode 200', function(done) {
      http.get('http://'+deviceUrlHttp, function(res) {
        assert.equal(res.statusCode, 200);
        done();
      }).on('error', done);
    });

    it('websocket should connect', function(done) {
      var url = 'ws://' + deviceUrl + '/bar';
      var error = 0;
      var open = false;
      var socket = new WebSocket(url);
      socket.on('open', function(err) {
        open = true;
      });
      socket.on('close', function(err) {
        open = false;
      });
      socket.on('error', function(err) {
        console.log('ERROR:', err);
        error++;
      });

      setTimeout(function() {
        socket.close();
        assert.equal(error, 0);
        assert.equal(open, true, 'ws should be opened');
        done();
      }, 20);
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
          var count = 0;
          s2.on('message', function(buf, flags) {
            count++;
          });

          setTimeout(function(){
            device.incrementStreamValue();
          }, 20)

          setTimeout(function() {
            if (count === 1) {
              done();
            } else {
              throw new Error('Should have only recieved one message. ' + count);
            }
          }, 100);
        });
      });

      return;
    });


    it('websocket should connect and recv data in json form', function(done) {
      var url = 'ws://' + deviceUrl + '/bar';
      var error = 0;
      var open = false;
      var socket = new WebSocket(url);
      socket.on('open', function(err) {
        open = true;
      });
      socket.on('close', function(err) {
        open = false;
      });
      socket.on('error', function(err) {
        error++;
      });

      setTimeout(function() {

        assert.equal(error, 0);
        assert.equal(open, true, 'ws should be opened');

        var recv = 0;
        var timer = null;
        socket.on('message', function(buf, flags) {
          var msg = JSON.parse(buf);
          recv++;
          assert(msg.timestamp);
          assert(msg.topic);
          assert.equal(msg.data, recv);
          if (recv === 3) {
            clearTimeout(timer);
            socket.close();
            done();
          }
        });

        device.incrementStreamValue();
        device.incrementStreamValue();
        device.incrementStreamValue();

        timer = setTimeout(function() {
          assert.equal(recv, 3, 'should have received 3 messages');
          socket.close();
          done();
        }, 100);

      }, 20);
    });



    it('websocket should connect and recv device log events', function(done) {
      var url = 'ws://' + deviceUrl + '/logs';
      var error = 0;
      var open = false;
      var socket = new WebSocket(url);
      socket.on('open', function(err) {
        open = true;
      });
      socket.on('close', function(err) {
        open = false;
      });
      socket.on('error', function(err) {
        error++;
      });

      setTimeout(function() {
        assert.equal(error, 0);
        assert.equal(open, true, 'ws should be opened');

        var recv = 0;
        var timer = null;
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
            clearTimeout(timer);
            socket.close();
            done();
          }
        });

        device.call('change');

        timer = setTimeout(function() {
          assert.equal(recv, 1, 'should have received 1 message');
          socket.close();
          done();
        }, 100);
      }, 20);
    });

    it('websocket should recv connect and disconnect message for /peer-management', function(done) {
      var url = 'ws://localhost:' + port + '/peer-management';
      var socket = new WebSocket(url);
      
      socket.on('open', function(err) {
        socket.once('message', function(buf, flags) {
          var msg = JSON.parse(buf);          
          assert.equal(msg.topic, 'connect');
          socket.once('message', function(buf, flags) {
            var msg = JSON.parse(buf);
            assert.equal(msg.topic, 'disconnect');
            done();
          });
          app.pubsub.publish('_peer/disconnect', { topic: 'disconnect'});
        });
        app.pubsub.publish('_peer/connect', { topic: 'connect'});
      });
      socket.on('error', done);
    });

  });






  describe('Receive binary messages', function() {

    it('websocket should connect and recv data in binary form', function(done) {
      var url = 'ws://' + deviceUrl + '/foobar';
      var error = 0;
      var open = false;
      var socket = new WebSocket(url);
      socket.on('open', function(err) {
        open = true;
      });
      socket.on('close', function(err) {
        open = false;
      });
      socket.on('error', function(err) {
        error++;
      });

      setTimeout(function() {

        assert.equal(error, 0);
        assert.equal(open, true, 'ws should be opened');

        var recv = 0;
        var timer = null;
        socket.on('message', function(buf, flags) {
          assert(Buffer.isBuffer(buf));
          assert(flags.binary);
          recv++;
          assert.equal(buf[0], recv);
          if (recv === 3) {
            clearTimeout(timer);
            socket.close();
            done();
          }
        });

        device.incrementFooBar();
        device.incrementFooBar();
        device.incrementFooBar();

        timer = setTimeout(function() {
          assert.equal(recv, 3, 'should have received 3 messages');
          socket.close();
          done();
        }, 100);

      }, 20);
    });

  });



});
