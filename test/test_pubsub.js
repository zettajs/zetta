const assert = require('assert');
const PubSub = require('../lib/pubsub_service');


function makeFakeRequest(fd) {
  return { connection: { socket: { _handle: { fd: (fd || 1) }} }};
}

class Response {
  constructor(cb) {
    this.cb = cb;
  }

  push(topic, options) {
    const r = this;

    class Stream {
      constructor() {
        this.topic = topic;
        this.options = options;
      }

      end(data) {
        r.cb(data);
      }

      on() {}
    }

    return new Stream();
  }
}

describe('Pubsub Service', () => {
  it('exposes subscribe / publish', () => {
    const ps = new PubSub();
    assert.equal(typeof ps.publish, 'function');
    assert.equal(typeof ps.subscribe, 'function');
  });

  it('subscribe takes a callback and topic', () => {
    const ps = new PubSub();
    ps.subscribe('some-topic', (topic, name) => {});
  });

  it('subscribe takes a spdy response object', () => {
    const ps = new PubSub();
    const r = new Response(() => {});
    ps.subscribe('some-topic', {request: makeFakeRequest(1), response: r});
  });

  it('publish does not fail when there are no listeners', () => {
    const ps = new PubSub();
    ps.publish('some-topic', 123);
  });

  it('publish passes to callback', done => {
    const ps = new PubSub();
    let received = 0;
    ps.subscribe('some-topic', () => {
      received++;
    });
    ps.publish('some-topic', 123);
    
    setTimeout(() => {
      assert.equal(received, 1);
      done();
    }, 1);
  });

  it('publish passes to response', done => {
    const ps = new PubSub();
    let received = 0;
    const r = new Response(() => {
      received++;
    });

    ps.subscribe('some-topic', {request:  makeFakeRequest(1), response: r});
    ps.publish('some-topic', 123);
    
    setTimeout(() => {
      assert.equal(received, 1);
      done();
    }, 1);
  });


  it('publish passes to response and callback on same topic', done => {
    const ps = new PubSub();
    let receivedA = 0;
    let receivedB = 0;
    const r = new Response(() => {
      receivedA++;
    });

    ps.subscribe('some-topic', {request:  makeFakeRequest(1), response: r});
    ps.subscribe('some-topic', () => {receivedB++;});
    ps.publish('some-topic', 123);
    
    setTimeout(() => {
      assert.equal(receivedA, 1);
      assert.equal(receivedB, 1);
      done();
    }, 1);
  });


  it('unsubscribe should remove listener', done => {
    const ps = new PubSub();
    let receivedA = 0;
    const listener = () => {receivedA++;};

    ps.subscribe('some-topic', listener);
    ps.publish('some-topic', 123);
    
    setTimeout(() => {
      assert.equal(receivedA, 1);
      ps.unsubscribe('some-topic', listener);
      ps.publish('some-topic', 123);
      setTimeout(() => {
        assert.equal(receivedA, 1);
        ps.unsubscribe('some-topic', listener);
        done();
      }, 1);
    }, 1);
  });

  it('one http subscription and one callback that match the same event will emit one event on both', done => {
    const ps = new PubSub();
    let receivedA = 0;
    let receivedB = 0;

    const r1 = new Response(() => {
      receivedA++;
    });

    const listener = () => {receivedB++;};

    ps.subscribe('led/123/state', {request:  makeFakeRequest(1), response: r1 });
    ps.subscribe('led/*/state', listener);
    ps.publish('led/123/state', 123);
    
    setTimeout(() => {
      assert.equal(receivedA, 1);
      assert.equal(receivedB, 1);
      done();
    }, 10);
  });

  it('two subscriptions with callback that match the same event will emit one event on both', done => {
    const ps = new PubSub();
    let receivedA = 0;
    let receivedB = 0;
    let receivedC = 0;

    const listener1 = () => {receivedA++;};
    const listener2 = () => {receivedB++;};
    const listener3 = () => {receivedC++;};

    ps.subscribe('led/123/state', listener1);
    ps.subscribe('led/*/state', listener2);
    ps.subscribe('led/*/state', listener3);
    ps.publish('led/123/state', 123);
    
    setTimeout(() => {
      assert.equal(receivedA, 1);
      assert.equal(receivedB, 1);
      done();
    }, 1);
  });

  it('two http subscriptions that match the same event will only emit event on the first subscription', done => {
    const ps = new PubSub();
    let receivedA = 0;
    let receivedB = 0;

    const r1 = new Response(() => {
      receivedA++;
    });

    const r2 = new Response(() => {
      receivedB++;
    });

    ps.subscribe('led/123/state', {request:  makeFakeRequest(1), response: r1 });
    ps.subscribe('led/*/state', {request:  makeFakeRequest(1), response: r2 });
    ps.publish('led/123/state', 123);
    
    setTimeout(() => {
      assert.equal(receivedA, 1);
      assert.equal(receivedB, 0);
      done();
    }, 1);
  });
  


});
