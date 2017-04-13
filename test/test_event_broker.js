const assert = require('assert');
const util = require('util');
const net = require('net');
const EventEmitter = require('events').EventEmitter;
const zetta = require('../');
const EventSocket = require('../lib/event_socket');
const EventBroker = require('../lib/event_broker');
const PeerRegistry = require('./fixture/scout_test_mocks').MockPeerRegistry;
const PeerSocket = require('../lib/peer_socket');
const Registry = require('./fixture/scout_test_mocks').MockRegistry;

const Ws = function() {
  EventEmitter.call(this)
  this._socket = new net.Socket();
  this.upgradeReq = { url: '/peers/0ac7e9c2-f03f-478c-95f5-2028fc9c2b6e?connectionId=46f466b0-1017-430b-8993-d7a8c896e014'};
};
util.inherits(Ws, EventEmitter);
Ws.prototype.send = function(data, options, cb) {
  const r = this.emit('onsend', data, options, cb);
};
Ws.prototype.close = () => {};


describe('EventBroker', () => {
  const msg = JSON.stringify({topic: '_peer/connect', data: {somedata: 1}, timestamp: new Date().getTime()});
  let query = null;
  let app = null;
  let broker = null;
  let peerRegistry = null;
  beforeEach(() => {
    const reg = new Registry();
    peerRegistry = new PeerRegistry();
    app = zetta({ registry: reg, peerRegistry }).silent();
    query = { topic: '_peer/connect', name: app.id };
    broker = new EventBroker(app);
  });


  it('it should add peer by server name', () => {
    const ws = new Ws();
    const peer = new PeerSocket(ws, 'some-peer', peerRegistry);
    peer.name = 'some-peer2';
    broker.peer(peer);
    assert.equal(peer, broker.peers['some-peer2']);
  });

  it('it should pass data from local pubsub to clients', done => {
    const ws = new Ws();
    const client = new EventSocket(ws, query);
    broker.client(client);

    ws.on('onsend', buf => {
      const msg = JSON.parse(buf);
      assert.equal(msg.topic, '_peer/connect');
      assert(msg.timestamp);
      assert.deepEqual(msg.data, { somedata: 1 });
      done();
    });

    app.pubsub.publish('_peer/connect', msg);
  });

  it('should keep local pubsub subscription open when more than one client is active', done => {
    const clientA = new EventSocket(new Ws(), query);
    const clientB = new EventSocket(new Ws(), query);
    broker.client(clientA);
    broker.client(clientB);

    let recievedA = 0;
    let recievedB = 0;
    clientA.ws.on('onsend', buf => {
      recievedA++;
    });
    clientB.ws.on('onsend', buf => {
      recievedB++;
    });

    setTimeout(() => {
      assert.equal(recievedA, 1);
      assert.equal(recievedB, 1);

      clientA.emit('close');

      setTimeout(() => {
        assert.equal(recievedA, 1);
        assert.equal(recievedB, 2);
        done();
      }, 2);

      app.pubsub.publish('_peer/connect', {});
    }, 2);

    app.pubsub.publish('_peer/connect', {});
  });

});
