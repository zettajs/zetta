var assert = require('assert');
var util = require('util');
var zetta = require('../zetta');
var MemRegistry = require('./fixture/mem_registry');
var MemPeerRegistry = require('./fixture/mem_peer_registry');

var Device = require('zetta-device');
var HttpDevice = require('zetta-http-device');
var Scout = require('zetta-scout');
var ExampleDevice = require('./fixture/example_driver');

var TEST_PORT = process.env.TEST_PORT || Math.floor(1000 + Math.random() * 1000);

describe('Zetta', function() {
  var reg = null;
  var peerRegistry = null;

  beforeEach(function() {
    reg = new MemRegistry();
    peerRegistry = new MemPeerRegistry();
  });
  
  it('should be attached to the zetta as a function', function() {
    assert.equal(typeof zetta, 'function');
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

  it('should initialize 3 devices with correct params when using multiple use', function(done) {
    var z = zetta({ registry: reg, peerRegistry: peerRegistry })
      .use(ExampleDevice, 1, 'a')
      .use(ExampleDevice, 2, 'b')
      .use(ExampleDevice, 3, 'c')
      ._run(function(err) {
        if (err) {
          return done(err);
        }
        
        var find = function(x, y) {
          return Object.keys(z.runtime._jsDevices).some(function(key){
            var device = z.runtime._jsDevices[key];
            return device._x === x && device._y === y;
          });
        };

        assert(find(1, 'a'));
        assert(find(2, 'b'));
        assert(find(3, 'c'));

        done();
      });
  });



  it('should provision 3 devices already in registry with correct params when using multiple use', function(done) {
    var z = zetta({ registry: reg, peerRegistry: peerRegistry })
      .use(ExampleDevice, 1, 'a')
      .use(ExampleDevice, 2, 'b')
      .use(ExampleDevice, 3, 'c')
      ._run(function(err) {
        if (err) {
          return done(err);
        }

        var find = function(x, y) {
          var id = null;
          Object.keys(z.runtime._jsDevices).some(function(key){
            var device = z.runtime._jsDevices[key];
            if (device._x === x && device._y === y) {
              id = device.id;
              return true;
            }
          });
          
          return id;
        };

        assert(find(1, 'a'));
        assert(find(2, 'b'));
        assert(find(3, 'c'));

        var z2 = zetta({ registry: reg, peerRegistry: peerRegistry })
          .use(ExampleDevice, 1, 'a')
          .use(ExampleDevice, 2, 'b')
          .use(ExampleDevice, 3, 'c')
          ._run(function(err) {
            if (err) {
              return done(err);
            }
          
            var find2 = function(id, x, y) {
              return Object.keys(z2.runtime._jsDevices).some(function(key){
                var device = z2.runtime._jsDevices[key];
                return device.id === id && device._x === x && device._y === y;
              });
            };
  
            assert(find2(find(1, 'a'), 1, 'a'));
            assert(find2(find(2, 'b'), 2, 'b'));
            assert(find2(find(3, 'c'), 3, 'c'));
            done();
          });
      });
  });
  
  describe('peering', function() {
    it('.link should add to peers', function(done){
      var app = zetta({ peerRegistry: peerRegistry, registry: reg });
      app.link('http://example.com/');
      app._initPeers(function(err) {
        setTimeout(function() {
          assert.equal(app._peerClients.length, 1);
          done();
        }, 100);
      });
    });
    
    it('.link should not add to peers', function(done){
      
      peerRegistry.db.put('1234567', JSON.stringify({id: '1234567', direction: 'initiator', url: 'http://example.com/', fromLink: true}), function(err){
        var app = zetta({ peerRegistry: peerRegistry, registry: reg });
        app._initPeers(function(err) {
          setTimeout(function() {
            assert.equal(app._peerClients.length, 0);
            done();
          }, 100);
        });
      });
    });

  it('will init API peers.', function(done){
      
      peerRegistry.db.put('1234567', JSON.stringify({id: '1234567', direction: 'initiator', url: 'http://example.com/'}), function(err){
        var app = zetta({ peerRegistry: peerRegistry, registry: reg });
        app._initPeers(function(err) {
          setTimeout(function() {
            assert.equal(app._peerClients.length, 1);
            done();
          }, 100);
        });
      });
    });

  });


});
