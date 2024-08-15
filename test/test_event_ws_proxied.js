var zetta = require('../');
var assert = require('assert');
var http = require('http');
var WebSocket = require('ws');
var Scout = require('./fixture/example_scout');
var zettacluster = require('zetta-cluster');

describe('Event Websocket Proxied Through Peer', function() {
  var base = null;
  var cluster = null;
  var device = null;

  beforeEach(function(done) {
    cluster = zettacluster({ zetta: zetta })
      .server('cloud deploy')
      .server('detroit 1', [Scout], ['cloud deploy'])
      .on('ready', function(){
        var id = cluster.servers['detroit 1'].id;
        base = 'localhost:' + cluster.servers['cloud deploy']._testPort + '/servers/' + cluster.servers['cloud deploy'].locatePeer(id);
        var did = Object.keys(cluster.servers['detroit 1'].runtime._jsDevices)[0];
        device = cluster.servers['detroit 1'].runtime._jsDevices[did];
        setTimeout(done, 300);
      })
      .run(function(err) {
        if (err) {
          done(err);
        }
      });
  });

  afterEach(function(done) {
    cluster.stop();
    setTimeout(done, 10); // fix issues with server not being closed before a new one starts
  });

  describe('Basic Connection', function() {

    it('http resource should exist with statusCode 200', function(done) {
      http.get('http://' + base + '/devices/' + device.id, function(res) {
        assert.equal(res.statusCode, 200);
        done();
      }).on('error', done);
    });

    it('websocket should connect', function(done) {
      var url = 'ws://' + base + '/events?topic=testdriver/'+device.id+'/bar';
      var socket = new WebSocket(url);
      socket.on('open', done);
    });
  });



  describe('Receive json messages', function() {

    it('websocket should connect and recv data in json form', function(done) {
      var url = 'ws://' + base + '/events?topic=testdriver/'+device.id+'/bar';
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
            done();
          }
        });

        setTimeout(function() {
          device.incrementStreamValue();
          device.incrementStreamValue();
          device.incrementStreamValue();
        }, 100);
      });
    });

    it('websocket should recv only one set of messages when reconnecting', function(done) {
      var url = 'ws://' + base + '/events?topic=testdriver/'+device.id+'/bar';

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

          setTimeout(function() {
            device.incrementStreamValue();

            setTimeout(function() {
              assert.equal(count, 1, 'Should have only received 1 message. Received: ' + count);
              done();
            }, 500);
          }, 100);
        });
      });

      return;
    });


    it('websocket should connect and recv device log events', function(done) {
      var url = 'ws://' + base + '/events?topic=testdriver/'+device.id+'/logs';
      var socket = new WebSocket(url);
      socket.on('open', function(err) {
        socket.on('message', function(buf, flags) {
          var msg = JSON.parse(buf);
          assert(msg.timestamp);
          assert(msg.topic);
          assert(msg.actions.filter(function(action) {
            return action.name === 'prepare';
          }).length > 0);
          
          assert.equal(msg.actions[0].href.replace('http://',''), base + '/devices/' + device.id)
          done();
        });
        
        setTimeout(function() {
          device.call('change');
        }, 100);
      });        
    });

  });






  describe('Receive binary messages', function() {

    it('websocket should connect and recv data in binary form', function(done) {
      var url = 'ws://' + base + '/events?topic=testdriver/'+device.id+'/foobar';
      var socket = new WebSocket(url);
      socket.on('open', function(err) {
        var recv = 0;
        socket.on('message', function(buf, flags) {
          assert(Buffer.isBuffer(buf));
          recv++;
          assert.equal(buf[0], recv);
          if (recv === 3) {
            done();
          }
        });

        setTimeout(function() {
          device.incrementFooBar();
          device.incrementFooBar();
          device.incrementFooBar();
        }, 100);
      });
    });

  });



});
