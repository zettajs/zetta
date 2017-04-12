var StreamTopic = require('zetta-events-stream-protocol').StreamTopic;
var assert = require('assert');
var Query = require('calypso').Query;

describe('Stream Topic', function() {
  it('will correctly parse a topic of all valid strings', function() {
    var t = new StreamTopic();
    t.parse('Detroit/led/1234/state');
    assert.equal(t.serverName(), 'Detroit');
    assert.equal(t.pubsubIdentifier(), 'led/1234/state');
    assert.equal(t.streamQuery, null);
  });

  it('will correctly parse a topic with RegExp throughout', function() {
    var t = new StreamTopic();
    t.parse('{^Det.+$}/**/{^stream.+$}');
    assert(t.serverName().test);
    assert.equal(t.pubsubIdentifier(), '**/{^stream.+$}');
    assert.equal(t.streamQuery, null);
  });

  it('will correctly parse a topic with regex and *', function() {
    var t = new StreamTopic();
    t.parse('{^Det.+$}/{^zigbee.+$}/*/{^stream.+$}');
    assert(t.serverName().test);
    assert.equal(t.pubsubIdentifier(), '{^zigbee.+$}/*/{^stream.+$}');
    assert.equal(t.streamQuery, null);
  });

  it('will correctly parse a topic with regex and * for all paths', function() {
    var t = new StreamTopic();
    t.parse('{^Det.+$}/*/*/*');
    assert(t.serverName().test);
    assert.equal(t.pubsubIdentifier(), '*/*/*');
    assert.equal(t.streamQuery, null);
  });

  it('will correctly parse a topic with regex and ** for paths', function() {
    var t = new StreamTopic();
    t.parse('{^Det.+$}/**');
    assert(t.serverName().test);
    assert.equal(t.pubsubIdentifier(), '**');
    assert.equal(t.streamQuery, null);
  });

  it('will correctly parse a regex out of a topic string', function() {
    var t = new StreamTopic();
    t.parse('{^Det.+$}/led/1234/state');
    assert(t.serverName().test);
    assert.equal(t.pubsubIdentifier(), 'led/1234/state');
    assert.equal(t.streamQuery, null);
  });

  it('will correctly parse a query out of a topic string', function() {
    var t = new StreamTopic();
    t.parse('Detroit/led/1234/state?select * where data > 80');
    assert.equal(t.serverName(), 'Detroit');
    assert.equal(t.pubsubIdentifier(), 'led/1234/state');
    assert.equal(t.streamQuery, 'select * where data > 80');
  });

  it('will correctly parse topics without the leading server name', function() {
    var t = new StreamTopic();
    t.parse('led/1234/state');
    assert.equal(t.serverName(), 'led');
    assert.equal(t.pubsubIdentifier(), '1234/state');
    assert.equal(t.streamQuery, null);
  })

  it('will correctly parse a topic with double star', function() {
    var t = new StreamTopic();
    t.parse('hub/led/**');
    assert.equal(t.serverName(), 'hub');
    assert.equal(t.pubsubIdentifier(), 'led/**');
    assert.equal(t.streamQuery, null);
  });

  it('will correctly parse a topic hub/**/state', function() {
    var t = new StreamTopic();
    t.parse('hub/**/state');
    assert.equal(t.serverName(), 'hub');
    assert.equal(t.pubsubIdentifier(), '**/state');
    assert.equal(t.streamQuery, null);
  });

  it('will correctly parse a regex topic with a ? in it', function() {
    var t = new StreamTopic();
    t.parse('{Detroit-?123}/**/state');
    assert(t.serverName().test);
    assert.equal(t.pubsubIdentifier(), '**/state');
    assert.equal(t.streamQuery, null);
  });

  it('will correctly parse a regex topic with a ? in it and a query', function() {
    var t = new StreamTopic();
    t.parse('{Detroit-?123}/**/state?select * where data > 80');
    assert(t.serverName().test);
    assert.equal(t.pubsubIdentifier(), '**/state');
    assert.equal(t.streamQuery, 'select * where data > 80');
  });

  it('will correctly parse **/some-topic', function() {
    var t = new StreamTopic();
    t.parse('**/some-topic');
    assert.equal(t.serverName(), '*');
    assert.equal(t.pubsubIdentifier(), '**/some-topic');
    assert.equal(t.streamQuery, null); 
  });

  it('will correctly parse **/led/123/state', function() {
    var t = new StreamTopic();
    t.parse('**/led/123/state');
    assert.equal(t.serverName(), '*');
    assert.equal(t.pubsubIdentifier(), 'led/123/state');
    assert.equal(t.streamQuery, null); 
  });

  it('will correctly parse **/123/state', function() {
    var t = new StreamTopic();
    t.parse('**/123/state');
    assert.equal(t.serverName(), '*');
    assert.equal(t.pubsubIdentifier(), '**/123/state');
    assert.equal(t.streamQuery, null); 
  });


  function checkSpecial(topic) {
    it('will correctly parse special topic ' + topic, function() {
      var t = new StreamTopic();
      t.parse(topic);
      assert.equal(t.serverName(), null);
      assert.equal(t.isSpecial, true);
      assert.equal(t.pubsubIdentifier(), topic);
    })
  }

  checkSpecial('_peer/connect');
  checkSpecial('_peer/disconnect');
  checkSpecial('_peer/*');
  checkSpecial('_peer/**');
  checkSpecial('query:where type="led"');
  checkSpecial('query/where type="led"');
  
  it('hash() will return the original input', function() {
    var t = new StreamTopic();
    var topic = '{^Det.+$}/led/1234/state?select * where data > 80';
    t.parse(topic);
    assert.equal(t.hash(), topic);
  })

  describe('.match()', function() {

    function matchTest(query, topic, eval_) {
      it('should return ' + eval_ + ' for query ' + query + ' on topic ' + topic, function() {
        var t = StreamTopic.parse(query);
        assert.equal(t.match(topic), eval_);
      })
    }

    matchTest('led/123/*', 'led/123/state', true);
    matchTest('led/321/*', 'led/123/state', false);
    matchTest('Detroit/led/123/*', 'led/123/state', false);
    matchTest('led/**', 'led/123/state', true);
    matchTest('{^Det.+$}/led/123/state', 'Detroit-123/led/123/state', true);
    matchTest('{^Det.+$}/led/123/state', 'hub/led/123/state', false);
    matchTest('{^Det.+$}/led/**', 'Detroit-123/led/123/stream', true);
    matchTest('{^Det.+$}/led/123/{^stream.+$}', 'Detroit-123/led/123/stream-123', true); 
    matchTest('{^Det.+$}/**/{^stream.+$}', 'Detroit-123/led/123/stream-123', true);
    matchTest('{^Det.+$}/**', 'Detroit-123/led/123/stream', true);
    matchTest('*/led/**', 'hub/led/123/state', true);
  });
  
});
