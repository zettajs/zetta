const assert = require('assert');
const util = require('util');
const EventEmitter = require('events').EventEmitter;

const EventSocket = require('../lib/event_socket');

class Ws extends EventEmitter {
  constructor() {
    super()
  }

  send(data, options, cb) {
    this.emit('onsend', data, options, cb);
  }
}



describe('EventSocket', () => {

  it('it should initialization with topic set', () => {
    const ws = new Ws();
    const client = new EventSocket(ws, { topic: 'some-topic' });
    assert.equal(client.query[0].topic, 'some-topic');
  });

  it('EventSocket.send should pass data/options/callback to ws send', done => {
    const ws = new Ws();
    const client = new EventSocket(ws, 'some-topic');

    ws.on('onsend', (data, options, cb) => {
      assert.equal(data, 'somedata');
      assert.deepEqual(options, {opt: 1});
      assert.equal(cb, callback);
      done();
    });

    var callback = () => {};
    client.send('sometopic', 'somedata', {opt: 1}, callback);
  });

  it('websocket error event should trigger close on EventSocket', done => {
    const ws = new Ws();
    const client = new EventSocket(ws, 'some-topic');
    let triggered = false;

    client.on('close', () => {
      triggered = true;
    });
    ws.emit('error', new Error('some error'));
    setTimeout(() => {
      assert(triggered);
      done();
    },1);
  });

  it('websocket close event should trigger close on EventSocket', done => {
    const ws = new Ws();
    const client = new EventSocket(ws, 'some-topic');
    let triggered = false;

    client.on('close', () => {
      triggered = true;
    });
    ws.emit('close');
    setTimeout(() => {
      assert(triggered);
      done();
    },1);
  });

  it('should init parser if passed streaming flag', () => {
    const ws = new Ws();
    const client = new EventSocket(ws, 'some-topic', { streamEnabled: true });
    assert(client._parser)
  })

  it('should pass filterMultiple flag to EventSocket', () => {
    const ws = new Ws();
    const client = new EventSocket(ws, 'some-topic', { filterMultiple: true });
    assert(client.filterMultiple, true);
  })

  it('should emit subscribe event when subscribe message is parsed', done => {
    const ws = new Ws();
    const client = new EventSocket(ws, 'some-topic', { streamEnabled: true });
    client.on('subscribe', subscription => {
      assert(subscription.subscriptionId);
      assert(subscription.topic);
      assert.equal(subscription.limit, 10);
      done();
    })

    const msg = { type: 'subscribe', topic: 'Detroit/led/1234/state', limit: 10};
    ws.emit('message', new Buffer(JSON.stringify(msg)));
  })

  it('should not fail when sending null object with streamEnabled=true', done => {
    const ws = new Ws();
    const client = new EventSocket(ws, 'some-topic', { streamEnabled: true });
    ws.on('onsend', (data, options, cb) => {
      assert.equal(data, '{"data":null}');
      done();
    });
    client.send('some/topic', { data: null });
  })

  it('should not fail when sending null object with streamEnabled=false', done => {
    const ws = new Ws();
    const client = new EventSocket(ws, 'some-topic', { streamEnabled: false });
    ws.on('onsend', (data, options, cb) => {
      assert.equal(data, '{"data":null}');
      done();
    });
    client.send('some/topic', { data: null });
  })


});
