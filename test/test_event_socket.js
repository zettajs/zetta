const assert = require('assert');
const util = require('util');
const EventEmitter = require('events').EventEmitter;

const EventSocket = require('../lib/event_socket');

const Ws = function() {
  EventEmitter.call(this)
};
util.inherits(Ws, EventEmitter);
Ws.prototype.send = function(data, options, cb) {
  this.emit('onsend', data, options, cb);
};



describe('EventSocket', function() {

  it('it should initialization with topic set', function() {
    const ws = new Ws();
    const client = new EventSocket(ws, { topic: 'some-topic' });
    assert.equal(client.query[0].topic, 'some-topic');
  });

  it('EventSocket.send should pass data/options/callback to ws send', function(done) {
    const ws = new Ws();
    const client = new EventSocket(ws, 'some-topic');

    ws.on('onsend', function(data, options, cb) {
      assert.equal(data, 'somedata');
      assert.deepEqual(options, {opt: 1});
      assert.equal(cb, callback);
      done();
    });

    var callback = function() {};
    client.send('sometopic', 'somedata', {opt: 1}, callback);
  });

  it('websocket error event should trigger close on EventSocket', function(done) {
    const ws = new Ws();
    const client = new EventSocket(ws, 'some-topic');
    let triggered = false;

    client.on('close', function(){
      triggered = true;
    });
    ws.emit('error', new Error('some error'));
    setTimeout(function(){
      assert(triggered);
      done();
    },1);
  });

  it('websocket close event should trigger close on EventSocket', function(done) {
    const ws = new Ws();
    const client = new EventSocket(ws, 'some-topic');
    let triggered = false;

    client.on('close', function(){
      triggered = true;
    });
    ws.emit('close');
    setTimeout(function(){
      assert(triggered);
      done();
    },1);
  });

  it('should init parser if passed streaming flag', function() {
    const ws = new Ws();
    const client = new EventSocket(ws, 'some-topic', { streamEnabled: true });
    assert(client._parser)
  })

  it('should pass filterMultiple flag to EventSocket', function() {
    const ws = new Ws();
    const client = new EventSocket(ws, 'some-topic', { filterMultiple: true });
    assert(client.filterMultiple, true);
  })

  it('should emit subscribe event when subscribe message is parsed', function(done) {
    const ws = new Ws();
    const client = new EventSocket(ws, 'some-topic', { streamEnabled: true });
    client.on('subscribe', function(subscription) {
      assert(subscription.subscriptionId);
      assert(subscription.topic);
      assert.equal(subscription.limit, 10);
      done();
    })

    const msg = { type: 'subscribe', topic: 'Detroit/led/1234/state', limit: 10};
    ws.emit('message', new Buffer(JSON.stringify(msg)));
  })

  it('should not fail when sending null object with streamEnabled=true', function(done) {
    const ws = new Ws();
    const client = new EventSocket(ws, 'some-topic', { streamEnabled: true });
    ws.on('onsend', function(data, options, cb) {
      assert.equal(data, '{"data":null}');
      done();
    });
    client.send('some/topic', { data: null });
  })

  it('should not fail when sending null object with streamEnabled=false', function(done) {
    const ws = new Ws();
    const client = new EventSocket(ws, 'some-topic', { streamEnabled: false });
    ws.on('onsend', function(data, options, cb) {
      assert.equal(data, '{"data":null}');
      done();
    });
    client.send('some/topic', { data: null });
  })


});
