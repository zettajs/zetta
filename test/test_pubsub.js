const assert = require('assert');
const PubSub = require('../lib/pubsub_service');


function makeFakeRequest(fd) {
  return { connection: { socket: { _handle: { fd: (fd || 1) }} }};
}
const Response = function(cb) {
  this.cb = cb;
};
Response.prototype.push = function(topic, options) {
  const r = this;
  const Stream = function() {
    this.topic = topic;
    this.options = options;
  };
  Stream.prototype.end = function (data){
    r.cb(data);
  };
  Stream.prototype.on = function () {};

  return new Stream();
};

describe('Pubsub Service', function() {
  it('exposes subscribe / publish', function() {
    const ps = new PubSub();
    assert.equal(typeof ps.publish, 'function');
    assert.equal(typeof ps.subscribe, 'function');
  });

  it('subscribe takes a callback and topic', function() {
    const ps = new PubSub();
    ps.subscribe('some-topic', function(topic, name){});
  });

  it('subscribe takes a spdy response object', function() {
    const ps = new PubSub();
    const r = new Response(function() {});
    ps.subscribe('some-topic', {request: makeFakeRequest(1), response: r});
  });

  it('publish does not fail when there are no listeners', function() {
    const ps = new PubSub();
    ps.publish('some-topic', 123);
  });

  it('publish passes to callback', function(done) {
    const ps = new PubSub();
    let received = 0;
    ps.subscribe('some-topic', function() {
      received++;
    });
    ps.publish('some-topic', 123);
    
    setTimeout(function(){
      assert.equal(received, 1);
      done();
    }, 1);
  });

  it('publish passes to response', function(done) {
    const ps = new PubSub();
    let received = 0;
    const r = new Response(function() {
      received++;
    });

    ps.subscribe('some-topic', {request:  makeFakeRequest(1), response: r});
    ps.publish('some-topic', 123);
    
    setTimeout(function(){
      assert.equal(received, 1);
      done();
    }, 1);
  });


  it('publish passes to response and callback on same topic', function(done) {
    const ps = new PubSub();
    let receivedA = 0;
    let receivedB = 0;
    const r = new Response(function() {
      receivedA++;
    });

    ps.subscribe('some-topic', {request:  makeFakeRequest(1), response: r});
    ps.subscribe('some-topic', function() {receivedB++;});
    ps.publish('some-topic', 123);
    
    setTimeout(function(){
      assert.equal(receivedA, 1);
      assert.equal(receivedB, 1);
      done();
    }, 1);
  });


  it('unsubscribe should remove listener', function(done) {
    const ps = new PubSub();
    let receivedA = 0;
    const listener = function() {receivedA++;};

    ps.subscribe('some-topic', listener);
    ps.publish('some-topic', 123);
    
    setTimeout(function(){
      assert.equal(receivedA, 1);
      ps.unsubscribe('some-topic', listener);
      ps.publish('some-topic', 123);
      setTimeout(function(){
        assert.equal(receivedA, 1);
        ps.unsubscribe('some-topic', listener);
        done();
      }, 1);
    }, 1);
  });

  it('one http subscription and one callback that match the same event will emit one event on both', function(done) {
    const ps = new PubSub();
    let receivedA = 0;
    let receivedB = 0;

    const r1 = new Response(function() {
      receivedA++;
    });

    const listener = function() {receivedB++;};

    ps.subscribe('led/123/state', {request:  makeFakeRequest(1), response: r1 });
    ps.subscribe('led/*/state', listener);
    ps.publish('led/123/state', 123);
    
    setTimeout(function(){
      assert.equal(receivedA, 1);
      assert.equal(receivedB, 1);
      done();
    }, 10);
  });

  it('two subscriptions with callback that match the same event will emit one event on both', function(done) {
    const ps = new PubSub();
    let receivedA = 0;
    let receivedB = 0;
    let receivedC = 0;

    const listener1 = function() {receivedA++;};
    const listener2 = function() {receivedB++;};
    const listener3 = function() {receivedC++;};

    ps.subscribe('led/123/state', listener1);
    ps.subscribe('led/*/state', listener2);
    ps.subscribe('led/*/state', listener3);
    ps.publish('led/123/state', 123);
    
    setTimeout(function(){
      assert.equal(receivedA, 1);
      assert.equal(receivedB, 1);
      done();
    }, 1);
  });

  it('two http subscriptions that match the same event will only emit event on the first subscription', function(done) {
    const ps = new PubSub();
    let receivedA = 0;
    let receivedB = 0;

    const r1 = new Response(function() {
      receivedA++;
    });

    const r2 = new Response(function() {
      receivedB++;
    });

    ps.subscribe('led/123/state', {request:  makeFakeRequest(1), response: r1 });
    ps.subscribe('led/*/state', {request:  makeFakeRequest(1), response: r2 });
    ps.publish('led/123/state', 123);
    
    setTimeout(function(){
      assert.equal(receivedA, 1);
      assert.equal(receivedB, 0);
      done();
    }, 1);
  });
  


});
