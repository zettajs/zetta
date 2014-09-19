var assert = require('assert');
var util = require('util');

var zetta = require('../zetta');
var PeerRegistry = require('./fixture/scout_test_mocks').MockPeerRegistry;
var Registry = require('./fixture/scout_test_mocks').MockRegistry;
var Device = require('../lib/device');
var HttpDevice = require('../lib/http_device');
var Scout = require('../lib/scout');

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


  it('basic zetta server functionality should not break', function(done) {
    zetta({ registry: reg, peerRegistry: peerRegistry })
      .name('local')
      .expose('*')
      .load(function(server) {})
      .listen(TEST_PORT, function(err){
        done();
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

  it('will load an app with the use() function', function() {
    zetta({ registry: reg, peerRegistry: peerRegistry })
      .use(function(server) {
        assert.ok(server);
        done();
      });
  });

  it('will load a driver with the use() function', function() {
    var z = zetta({ registry: reg, peerRegistry: peerRegistry });
    function TestDriver() {
      Device.call(this);
    }
    util.inherits(TestDriver, Device);

    TestDriver.prototype.init = function() {};

    z.use(TestDriver);
    var s = z._scouts[0];
    assert.equal(s.server, z.runtime);
  });

  it('will load an HTTP driver with the use() function', function() {
    var z = zetta({ registry: reg, peerRegistry: peerRegistry });
    function TestDriver() {
      HttpDevice.call(this);
    }
    util.inherits(TestDriver, HttpDevice);

    TestDriver.prototype.init = function() {};

    z.use(TestDriver);
    var s = z._scouts[0];
    assert.equal(s.server, z.runtime);
  });

  it('will load a scout with the use() function', function() {
    var z = zetta({ registry: reg, peerRegistry: peerRegistry });
    function TestScout() {
      Scout.call(this);
    }
    util.inherits(TestScout, Scout);
    z.use(TestScout);
    assert.equal(z._scouts.length, 2);
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
    z.listen(TEST_PORT);

  });

  it('will apply arguments to httpServer when listen() is called', function(done) {
    function MockHttp(){}
    MockHttp.prototype.init = function(){};
    MockHttp.prototype.listen = function(port) {
      assert.equal(port, TEST_PORT);
      done();
    };

    var z = zetta({ registry: reg, peerRegistry: peerRegistry });
    z.httpServer = new MockHttp();
    z.listen(TEST_PORT);

  });

  it('will correctly apply the callback to httpServer when listen() is called', function(done) {
    function MockHttp(){}
    MockHttp.prototype.init = function(){};
    MockHttp.prototype.listen = function(port, cb) {
      assert.equal(port, TEST_PORT);
      cb(null);
    };

    var z = zetta({ registry: reg, peerRegistry: peerRegistry });
    z.httpServer = new MockHttp();
    z.listen(TEST_PORT, function(err) {
      assert.ok(!err);
      done();
    });
  });

});
