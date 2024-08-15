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

function getMocks() {
  var Ws = function() {
    EventEmitter.call(this)
    this._socket = new net.Socket();
  };
  util.inherits(Ws, EventEmitter);
  Ws.prototype.send = function(data, options, cb) {
    var r = this.emit('onsend', data, options, cb);
  };
  Ws.prototype.close = function() {};

  return {
    ws: new Ws(),
    req: {
      url: '/peers/0ac7e9c2-f03f-478c-95f5-2028fc9c2b6e?connectionId=46f466b0-1017-430b-8993-d7a8c896e014',
      headers: {}
    }
  }
}

describe('EventBroker', function() {
  var msg = JSON.stringify({topic: '_peer/connect', data: {somedata: 1}, timestamp: new Date().getTime()});
  var query = null;
  var app = null;
  var broker = null;
  var peerRegistry = null;
  beforeEach(function() {
    var reg = new Registry();
    peerRegistry = new PeerRegistry();
    app = zetta({ registry: reg, peerRegistry: peerRegistry }).silent();
    query = { topic: '_peer/connect', name: app.id };
    broker = new EventBroker(app);
  });

  it('it should add peer by server name', function() {
    var peer = {name: 'some-peer2'};
    broker.peer(peer);
    assert.equal(peer, broker.peers['some-peer2']);
  });

  it('it should pass data from local pubsub to clients', function(done) {
    var mocks = getMocks();
    var client = new EventSocket(mocks.ws, query);
    broker.client(client);

    mocks.ws.on('onsend', function(buf) {
      var msg = JSON.parse(buf);
      assert.equal(msg.topic, '_peer/connect');
      assert(msg.timestamp);
      assert.deepEqual(msg.data, { somedata: 1 });
      done();
    });

    app.pubsub.publish('_peer/connect', msg);
  });

  it('should keep local pubsub subscription open when more than one client is active', function(done) {

    var clientA = new EventSocket(getMocks().ws, query);
    var clientB = new EventSocket(getMocks().ws, query);
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

      setTimeout(function() {
        assert.equal(recievedA, 1);
        assert.equal(recievedB, 2);
        done();
      }, 2);

      app.pubsub.publish('_peer/connect', {});
    }, 2);

    app.pubsub.publish('_peer/connect', {});
  });

});
