var assert = require('assert');
var PubSub = require('../lib/pubsub_service');

var Response = function(cb) {
  this.cb = cb;
};
Response.prototype.push = function(topic, options) {
  var r = this;
  var Stream = function() {
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
    var ps = new PubSub();
    assert.equal(typeof ps.publish, 'function');
    assert.equal(typeof ps.subscribe, 'function');
  });

  it('subscribe takes a callback and topic', function() {
    var ps = new PubSub();
    ps.subscribe('some-topic', function(topic, name){});
  });

  it('subscribe takes a spdy response object', function() {
    var ps = new PubSub();
    var r = new Response(function() {});
    ps.subscribe('some-topic', r);
  });

  it('publish does not fail when there are no listeners', function() {
    var ps = new PubSub();
    ps.publish('some-topic', 123);
  });

  it('publish passes to callback', function(done) {
    var ps = new PubSub();
    var received = 0;
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
    var ps = new PubSub();
    var received = 0;
    var r = new Response(function() {
      received++;
    });

    ps.subscribe('some-topic', r);
    ps.publish('some-topic', 123);
    
    setTimeout(function(){
      assert.equal(received, 1);
      done();
    }, 1);
  });


  it('publish passes to response and callback on same topic', function(done) {
    var ps = new PubSub();
    var receivedA = 0;
    var receivedB = 0;
    var r = new Response(function() {
      receivedA++;
    });

    ps.subscribe('some-topic', r);
    ps.subscribe('some-topic', function() {receivedB++;});
    ps.publish('some-topic', 123);
    
    setTimeout(function(){
      assert.equal(receivedA, 1);
      assert.equal(receivedB, 1);
      done();
    }, 1);
  });


  it('unsubscribe should remove listener', function(done) {
    var ps = new PubSub();
    var receivedA = 0;
    var listener = function() {receivedA++;};

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
  


});
