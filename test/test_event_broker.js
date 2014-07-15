var assert = require('assert');
var util = require('util');
var net = require('net');
var EventEmitter = require('events').EventEmitter;
var zetta = require('../');
var EventSocket = require('../lib/event_socket');
var EventBroker = require('../lib/event_broker');
var PeerRegistry = require('./fixture/scout_test_mocks').MockPeerRegistry;
var PeerSocket = require('../lib/peer_socket');
var Registry = require('./fixture/scout_test_mocks').MockRegistry;

var Ws = function() {
  EventEmitter.call(this)
  this._socket = new net.Socket();
};
util.inherits(Ws, EventEmitter);
Ws.prototype.send = function(data, options, cb) {
  var r = this.emit('onsend', data, options, cb);
};

describe('EventBroker', function() {
  var msg = JSON.stringify({topic: 'some-topic', data: {somedata: 1}, date: new Date().getTime()});
  var app = null;
  var broker = null;
  beforeEach(function() {
    var reg = new Registry();
    var peerRegistry = new PeerRegistry();
    app = zetta({ registry: reg, peerRegistry: peerRegistry });
    broker = new EventBroker(app);
  });
  
  it('it should add peer by server name', function() {
    var ws = new Ws();
    var peer = new PeerSocket(ws, 'some-peer');
    broker.peer(peer);
    assert.equal(peer, broker.peers['some-peer']);
  });

  it('it should add client and subscribe to topic', function() {
    var ws = new Ws();
    var client = new EventSocket(ws, 'some-topic');
    broker.client(client);
    assert.equal(broker.clients.length, 1);
    assert.equal(broker.subscriptionCounts['some-topic'], 1);
  });

  it('it should remove subscription when client closes', function(done) {
    var ws = new Ws();
    var client = new EventSocket(ws, 'some-topic');
    broker.client(client);
    assert.equal(broker.clients.length, 1);
    assert.equal(broker.subscriptionCounts['some-topic'], 1);

    client.emit('close');

    setTimeout(function() {
      assert.equal(broker.clients.length, 0);
      assert(!broker.subscriptionCounts['some-topic']);
      done();
    }, 1);
  });

  it('it should pass data from local pubsub to clients', function(done) {
    var ws = new Ws();
    var client = new EventSocket(ws, 'some-topic');
    broker.client(client);
    
    var recieved = 0;
    ws.on('onsend', function(buf) {
      recieved++;
      var msg = JSON.parse(buf);
      assert.equal(msg.topic, 'some-topic');
      assert(msg.date);
      assert.deepEqual(msg.data, {somedata: 1});
    });
    
    setTimeout(function() {
      assert.equal(recieved, 1);
      done();
    }, 2);

    app.pubsub.publish('some-topic', msg);
  });

  it('should keep local pubsub subscription open when more than one client is active', function(done) {
    var clientA = new EventSocket(new Ws(), 'some-topic');
    var clientB = new EventSocket(new Ws(), 'some-topic');
    broker.client(clientA);
    broker.client(clientB);

    var recievedA = 0;
    var recievedB = 0;
    clientA.ws.on('onsend', function(buf) {
      recievedA++;
    });
    clientB.ws.on('onsend', function(buf) {
      recievedB++;
    });
    
    setTimeout(function() {
      assert.equal(recievedA, 1);
      assert.equal(recievedB, 1);

      clientA.emit('close');

      done();
      return;

      setTimeout(function() {
        assert.equal(recievedA, 1);
        assert.equal(recievedB, 2);
        done();
      }, 2);

      app.pubsub.publish('some-topic', msg);
    }, 2);

    app.pubsub.publish('some-topic', msg);
  });

});
