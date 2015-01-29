var assert = require('assert');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

var EventSocket = require('../lib/event_socket');

var Ws = function() {
  EventEmitter.call(this)
};
util.inherits(Ws, EventEmitter);
Ws.prototype.send = function(data, options, cb) {
  this.emit('onsend', data, options, cb);
};



describe('EventSocket', function() {

  it('it should initialization with topic set', function() {
    var ws = new Ws();
    var client = new EventSocket(ws, { topic: 'some-topic' });
    assert.equal(client.query.topic, 'some-topic');
  });

  it('EventSocket.send should pass data/options/callback to ws send', function(done) {
    var ws = new Ws();
    var client = new EventSocket(ws, 'some-topic');

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
    var ws = new Ws();
    var client = new EventSocket(ws, 'some-topic');
    var triggered = false;

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
    var ws = new Ws();
    var client = new EventSocket(ws, 'some-topic');
    var triggered = false;

    client.on('close', function(){
      triggered = true;
    });
    ws.emit('close');
    setTimeout(function(){
      assert(triggered);
      done();
    },1);
  });



});
