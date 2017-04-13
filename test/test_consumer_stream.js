const assert = require('assert');
const PubSub = require('../lib/pubsub_service');
const ConsumerStream = require('zetta-streams').ConsumerStream;

describe('ConsumerStream', () => {
  let stream = null;
  let pubsub = null;

  beforeEach(() => {
    pubsub = new PubSub();
    stream = new ConsumerStream('some-topic', {objectMode: true}, pubsub);
  });
  
  it('it should subscribe to pubsub topic', () => {
    stream.on('data', () => {});
    assert.equal(pubsub._listeners['some-topic'].length, 1);
  });

  it('it pass pubsub data to stream', done => {
    let received = 0;
    stream.on('data', msg => {
      assert.deepEqual(msg, {date: 0, data: 1});
      received++;
    });
    
    setTimeout(() => {
      assert.equal(received, 1);
      done();
    },2);
    
    pubsub.publish('some-topic', {date: 0, data: 1});
  });
   
});
