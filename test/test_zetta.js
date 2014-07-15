var assert = require('assert');

var zetta = require('../zetta');
var PeerRegistry = require('./fixture/scout_test_mocks').MockPeerRegistry;
var Registry = require('./fixture/scout_test_mocks').MockRegistry;

var TEST_PORT = process.env.TEST_PORT || Math.floor(1000 + Math.random() * 1000);

describe('Zetta', function() {
  var reg = null;
  var peerRegistry = null;

  beforeEach(function() {
    reg = new Registry();
    peerRegistry = new PeerRegistry();
  });
  
  it('should be attached to the zetta as a function', function() {
    assert.equal(typeof zetta, 'function');
  });


  it('basic zetta server functionality should not break', function() {
    zetta({ registry: reg, peerRegistry: peerRegistry })
      .name('local')
      .expose('*')
      .load(function(server) {})
      .listen(TEST_PORT, function(err){
      });
  });

  it('has the name set using the name() function.', function() {
    var z = zetta({ registry: reg, peerRegistry: peerRegistry }).name('local');

    assert.equal(z._name, 'local');
  });

  it('will load an app with the load() function', function() {
    zetta({ registry: reg, peerRegistry: peerRegistry })
      .load(function(server) {
        assert.ok(server);
        done();
      });
  });

  it('will load a scout with the use() function', function() {
    var z = zetta({ registry: reg, peerRegistry: peerRegistry });
    function TestScout(){}
    z.use(TestScout);
    assert.equal(z._scouts.length, 1);
    var s = z._scouts[0];
    assert.equal(s.server, z.runtime);
  });

  it('will set the what query is used for expose()', function() {
    var z = zetta({ registry: reg, peerRegistry: peerRegistry });
    z.expose('*');

    assert.ok(z._exposeQuery);
  });

  it('will call init on the server prototype to ensure everything is wired up correctly.', function(done) {
    function MockHttp(){}
    MockHttp.prototype.init = function() {
      done();
    };
    MockHttp.prototype.listen = function(port) {};

    var z = zetta({ registry: reg, peerRegistry: peerRegistry });
    z.httpServer = new MockHttp();
    z.listen(3000);

  });

  it('will apply arguments to httpServer when listen() is called', function(done) {
    function MockHttp(){}
    MockHttp.prototype.init = function(){};
    MockHttp.prototype.listen = function(port) {
      assert.equal(port, 3000);
      done();
    };

    var z = zetta({ registry: reg, peerRegistry: peerRegistry });
    z.httpServer = new MockHttp();
    z.listen(3000);

  });

  it('will correctly apply the callback to httpServer when listen() is called', function(done) {
    function MockHttp(){}
    MockHttp.prototype.init = function(){};
    MockHttp.prototype.listen = function(port, cb) {
      assert.equal(port, 3000);
      cb(null);
    };

    var z = zetta({ registry: reg, peerRegistry: peerRegistry });
    z.httpServer = new MockHttp();
    z.listen(3000, function(err) {
      assert.ok(!err);
      done();
    });
  });

});
