var assert = require('assert');
var http = require('http');
var WebSocket = require('ws');
var zettatest = require('./fixture/zetta_test');
var Scout = require('./fixture/example_scout');

describe('Event Websocket Proxied Through Peer', function() {
  var base = null;
  var cluster = null;
  var device = null;
  var deviceUrl = null;
  var deviceUrlHttp = null

  beforeEach(function(done) {
    cluster = zettatest()
      .server('cloud deploy')
      .server('detroit 1', [Scout], ['cloud deploy'])
      .run(function(err){
        var id = cluster.servers['detroit 1'].id;
        base = 'localhost:' + cluster.servers['cloud deploy']._testPort + '/servers/' + cluster.servers['cloud deploy'].locatePeer(id);
        var did = Object.keys(cluster.servers['detroit 1'].runtime._jsDevices)[0];
        device = cluster.servers['detroit 1'].runtime._jsDevices[did];
        done(err);
      })
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
        socket.close();
        assert.equal(error, 0);
        assert.equal(open, true, 'ws should be opened');
        done();
      }, 20);
    });

  });



  describe('Receive json messages', function() {

    it('websocket should connect and recv data in json form', function(done) {
      var url = 'ws://' + base + '/events?topic=testdriver/'+device.id+'/bar';
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

        var timer = null;
        var recv = 0;
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



  });






  describe('Receive binary messages', function() {

    it('websocket should connect and recv data in binary form', function(done) {
      var url = 'ws://' + base + '/events?topic=testdriver/'+device.id+'/foobar';
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
        var timer = null;
        var recv = 0;
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
