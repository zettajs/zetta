var StreamTopic = require('../lib/stream_topic');
var assert = require('assert');

describe('Stream Topic', function() {
  it('will correctly parse a topic of all valid strings', function() {
    var t = new StreamTopic();
    t.parse('Detroit/led/1234/state');
    assert.equal(t.serverName, 'Detroit');
    assert.equal(t.deviceType, 'led');
    assert.equal(t.deviceId, '1234');
    assert.equal(t.streamName, 'state');
  });  

  it('will correctly parse a regex out of a topic string', function() {
    var t = new StreamTopic();
    t.parse('{^Det.+$}/led/1234/state');
    assert(t.serverName.test);  
    assert.equal(t.deviceType, 'led');
    assert.equal(t.deviceId, '1234');
    assert.equal(t.streamName, 'state');
  });

  it('will correctly parse a query out of a topic string', function() {
    var t = new StreamTopic();
    t.parse('Detroit/led/1234/state?select * where data > 80');
    assert.equal(t.serverName, 'Detroit');
    assert.equal(t.deviceType, 'led');
    assert.equal(t.deviceId, '1234');
    assert.equal(t.streamName, 'state');
    assert.equal(t.streamQuery, 'select * where data > 80'); 
  });

  it('will correctly parse topics without the leading server name', function() {
    var t = new StreamTopic();
    t.parse('led/1234/state');
    assert.equal(t.serverName, null);
    assert.equal(t.deviceType, 'led');
    assert.equal(t.deviceId, '1234');
    assert.equal(t.streamName, 'state');    
  })

  it('hash() will return the original input', function() {
    var t = new StreamTopic();
    var topic = '{^Det.+$}/led/1234/state?select * where data > 80';
    t.parse(topic);
    assert.equal(t.hash(), topic);
  })

  describe('.match()', function() {

    function matchTest(query, topic, eval) {
      it('should return ' + eval + ' for query ' + query + ' on topic ' + topic, function() {
        var t = StreamTopic.parse(query);
        assert.equal(t.match(topic), eval);
      })
    }

    matchTest('led/123/*', 'led/123/state', true);
    matchTest('led/321/*', 'led/123/state', false);
    matchTest('led/**', 'led/123/state', true);
    matchTest('{^Det.+$}/led/123/state', 'Detroit-123/led/123/state', true);
    matchTest('{^Det.+$}/led/123/state', 'hub/led/123/state', false);
    matchTest('{^Det.+$}/led/**', 'Detroit-123/led/123/stream', true);
    matchTest('{^Det.+$}/led/123/{^stream.+$}', 'Detroit-123/led/123/stream-123', true); 
    matchTest('{^Det.+$}/**/{^stream.+$}', 'Detroit-123/led/123/stream-123', true);
    matchTest('{^Det.+$}/**', 'Detroit-123/led/123/stream', true);
  });
  
});
