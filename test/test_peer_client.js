var util = require('util');
var EventEmitter = require('events').EventEmitter;
var http = require('http');
var PeerClient = require('../lib/peer_client');
var assert = require('assert');
var zetta = require('../');
var Registry = require('./fixture/mem_registry');
var PeerRegistry = require('./fixture/mem_peer_registry');

var MockServer = { _name: '1234', httpServer: { spdyServer: {
  on: function() {},
  emit: function() {},
  removeListener: function() {}
}}, log: {
  emit: function() {}
}};

var MockSocket = function() {
  EventEmitter.call(this);
  this.setAddress = function() {};
  this.start = function() {};
};
util.inherits(MockSocket, EventEmitter);

var urlEndingWithSlash = 'http://cloud.zettajs.io/';
var urlEndingWithNoSlash = 'http://cloud.zettajs.io';

describe('Peer Client', function() {
  describe('url parsing', function() {
    it('should calculate the proper url with a trailing slash', function() {
      var client = new PeerClient(urlEndingWithSlash, MockServer);
      assert.equal(client.url, 'ws://cloud.zettajs.io/peers/1234');
    });

    it('should calculate the proper url without a trailing slash', function() {
      var client = new PeerClient(urlEndingWithNoSlash, MockServer); 
      assert.equal(client.url, 'ws://cloud.zettajs.io/peers/1234');
    });    
  });

  it('should emit error when underlying ws does', function(done) {
    var client = new PeerClient(urlEndingWithNoSlash, MockServer);
    client.ws = new MockSocket();
    client._createSocket();
    client.once('error', function(err) {
      assert.equal(err.message, 'some message');
      done();
    });

    client.once('closed', function() {
      done(new Error('Should not have emitted closed'));
    });

    setTimeout(function() {
      client.ws.emit('error', new Error('some message'));
    }, 2);
  })

  it('should emit closed when underlying ws does', function(done) {
    var client = new PeerClient(urlEndingWithNoSlash, MockServer);
    client.ws = new MockSocket();
    client._createSocket();
    client.once('error', function(err) {
      done(new Error('Should not have emitted error'));
    });

    client.once('closed', function() {
      done();
    });

    setTimeout(function() {
      client.ws.emit('close');
    }, 2);
  })

  it('should reconnect on timeout waiting for http res from ws server', function(done) {
    var httpServer = http.createServer(function(req, res) {
      console.log('on request:', req.url)
    }).on('upgrade', function(req, socket, upgradeHead) {
      console.log('on upgrade')
    }).listen(0, function(err) {
      if (err) {
        done(err);
        return;
      }

      var address = 'http://localhost:' + httpServer.address().port;
      var client = new PeerClient(address, MockServer);
      client.pingTimeout = 50;

      // monkey patch createSocket so we can watch the reconnect
      var origCreateSocket = client._createSocket;
      client._createSocket = function() {
        // Successfuly reconnected
        if (client.retryCount === 1) {
          httpServer.close();
          client.close();
          done();
          return;
        }
        origCreateSocket.apply(client, arguments);
      };

      client.start();
    });
  })

});
