const EventStreamParser = require('zetta-events-stream-protocol').Parser;
const assert = require('assert');

describe('Event Stream Parser', () => {
  it('validates subscribe messages correctly', () => {
    const message = { type: 'subscribe', topic: 'Detroit/led/1234/state' };
    const parser = new EventStreamParser();
    assert(parser.validate(message) === true);  
  });  

  it('invalidates subscribe messages correctly', () => {
    const message = { type: 'subscribe'};
    const parser = new EventStreamParser();
    assert(parser.validate(message) !== true);  
  });

  it('validates unsubscribe messages correctly', () => {
    const message = { type: 'unsubscribe', subscriptionId: 1 };
    const parser = new EventStreamParser();
    assert(parser.validate(message) === true);
  });

  it('invalidates unsubscribe messages correctly', () => {
    const message = { type: 'unsubscribe' };
    const parser = new EventStreamParser();
    assert(parser.validate(message) !== true);
  });

  it('validates unsubscribe-ack messages correctly', () => {
    const message = { type: 'unsubscribe-ack', subscriptionId: 1, timestamp: 1 };
    const parser = new EventStreamParser();
    assert(parser.validate(message) === true);
  });

  it('invalidates unsubscribe-ack messages correctly no subscriptionId', () => {
    const message = { type: 'unsubscribe-ack', timestamp: 1 };
    const parser = new EventStreamParser();
    assert(parser.validate(message) !== true);
  });

  it('invalidates unsubscribe-ack messages correctly no timestamp no subscriptionId', () => {
    const message = { type: 'unsubscribe-ack' };
    const parser = new EventStreamParser();
    assert(parser.validate(message) !== true);
  });

  it('invalidates unsubscribe-ack messages correctly no timestamp', () => {
    const message = { type: 'unsubscribe-ack', timestamp: 1 };
    const parser = new EventStreamParser();
    assert(parser.validate(message) !== true);  
  });

  it('validates subscribe-ack messages correctly', () => {
    const message = { type: 'unsubscribe-ack', timestamp: 1, topic: 'Detroit/led/1234/state', subscriptionId: 1};
    const parser = new EventStreamParser();
    assert(parser.validate(message) === true);
  });

  it('validates error messages correctly', () => {
    const message = { type: 'error', code: 1, timestamp: 1, topic: 'Detroit/led/1234/state' };
    const parser = new EventStreamParser();
    assert(parser.validate(message) === true);
  });

  it('validates event messages correctly', () => {
    const message = { type: 'event', timestamp: 1, topic: 'Detroit/led/1234/state', subscriptionId: 1 };
    const parser = new EventStreamParser();
    assert(parser.validate(message) === true);
  });

  it('should emit event for message type when parsing buffer', done => {
    const parser = new EventStreamParser();
    const message = { type: 'event', timestamp: 1, topic: 'Detroit/led/1234/state', subscriptionId: 1 };
    parser.on('event', msg => {
      assert.equal(msg.type, message.type);
      assert.equal(msg.timestamp, message.timestamp);
      assert.equal(msg.topic, message.topic);
      assert.equal(msg.subscriptionId, message.subscriptionId);
      done();
    });

    parser.add(new Buffer(JSON.stringify(message)));
  })

  it('should emit error for invalid message type when parsing buffer', done => {
    const parser = new EventStreamParser();
    const message = { type: 'not-a-message', timestamp: 1, topic: 'Detroit/led/1234/state', subscriptionId: 1 };
    parser.on('error', msg => {
      done();
    });

    parser.add(new Buffer(JSON.stringify(message)));
  })

  it('should emit error for invalid JSON when parsing buffer', done => {
    const parser = new EventStreamParser();
    parser.on('error', msg => {
      done();
    });

    parser.add(new Buffer('some text'));
  })

});
