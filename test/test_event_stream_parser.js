var EventStreamParser = require('zetta-events-stream-protocol').Parser;
var assert = require('assert');

describe('Event Stream Parser', function() {
  it('validates subscribe messages correctly', function() {
    var message = { type: 'subscribe', topic: 'Detroit/led/1234/state' };
    var parser = new EventStreamParser();
    assert(parser.validate(message));  
  });  

  it('invalidates subscribe messages correctly', function() {
    var message = { type: 'subscribe'};
    var parser = new EventStreamParser();
    assert(!parser.validate(message));  
  });

  it('validates unsubscribe messages correctly', function() {
    var message = { type: 'unsubscribe', subscriptionId: 1 };
    var parser = new EventStreamParser();
    assert(parser.validate(message));  
  });

  it('invalidates unsubscribe messages correctly', function() {
    var message = { type: 'unsubscribe' };
    var parser = new EventStreamParser();
    assert(!parser.validate(message));  
  });

  it('validates unsubscribe-ack messages correctly', function() {
    var message = { type: 'unsubscribe-ack', subscriptionId: 1, timestamp: 1 };
    var parser = new EventStreamParser();
    assert(parser.validate(message));  
  });

  it('invalidates unsubscribe-ack messages correctly no subscriptionId', function() {
    var message = { type: 'unsubscribe-ack', timestamp: 1 };
    var parser = new EventStreamParser();
    assert(!parser.validate(message));  
  });

  it('invalidates unsubscribe-ack messages correctly no timestamp no subscriptionId', function() {
    var message = { type: 'unsubscribe-ack' };
    var parser = new EventStreamParser();
    assert(!parser.validate(message));  
  });

  it('invalidates unsubscribe-ack messages correctly no timestamp', function() {
    var message = { type: 'unsubscribe-ack', timestamp: 1 };
    var parser = new EventStreamParser();
    assert(!parser.validate(message));  
  });

  it('validates subscribe-ack messages correctly', function() {
    var message = { type: 'unsubscribe-ack', timestamp: 1, topic: 'Detroit/led/1234/state', subscriptionId: 1};
    var parser = new EventStreamParser();
    assert(parser.validate(message));  
  });

  it('validates error messages correctly', function() {
    var message = { type: 'error', code: 1, timestamp: 1, topic: 'Detroit/led/1234/state' };
    var parser = new EventStreamParser();
    assert(parser.validate(message));  
  });

  it('validates event messages correctly', function() {
    var message = { type: 'event', timestamp: 1, topic: 'Detroit/led/1234/state', subscriptionId: 1 };
    var parser = new EventStreamParser();
    assert(parser.validate(message));  
  });

  it('should emit event for message type when parsing buffer', function(done) {
    var parser = new EventStreamParser();
    var message = { type: 'event', timestamp: 1, topic: 'Detroit/led/1234/state', subscriptionId: 1 };
    parser.on('event', function(msg) {
      assert.equal(msg.type, message.type);
      assert.equal(msg.timestamp, message.timestamp);
      assert.equal(msg.topic, message.topic);
      assert.equal(msg.subscriptionId, message.subscriptionId);
      done();
    });

    parser.add(new Buffer(JSON.stringify(message)));
  })

  it('should emit error for invalid message type when parsing buffer', function(done) {
    var parser = new EventStreamParser();
    var message = { type: 'not-a-message', timestamp: 1, topic: 'Detroit/led/1234/state', subscriptionId: 1 };
    parser.on('error', function(msg) {
      done();
    });

    parser.add(new Buffer(JSON.stringify(message)));
  })

  it('should emit error for invalid JSON when parsing buffer', function(done) {
    var parser = new EventStreamParser();
    parser.on('error', function(msg) {
      done();
    });

    parser.add(new Buffer('some text'));
  })

});
