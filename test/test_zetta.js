var assert = require('assert');
var util = require('util');
var zetta = require('../zetta');
var MemRegistry = require('./fixture/mem_registry');
var MemPeerRegistry = require('./fixture/mem_peer_registry');

var Device = require('zetta-device');
var HttpDevice = require('zetta-http-device');
var Scout = require('zetta-scout');
var ExampleDevice = require('./fixture/example_driver');
var Query = require('calypso').Query;

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
    var z = zetta({ registry: reg, peerRegistry: peerRegistry }).name('local').silent();
    assert.equal(z._name, 'local');
  });

  it('should throw error if setting name to *', function() {
    assert.throws(function() {
      var z = zetta({ registry: reg, peerRegistry: peerRegistry }).name('*').silent();
    }, Error);
  });

  it('has the silent() function to suppress logging.', function() {
    var z = zetta({ registry: reg, peerRegistry: peerRegistry }).name('local').silent();
  });

  it('test try catch', function(done) {
    var d = require('domain').create();
    d.on('error', function(err) {
      done();
    });
    d.run(function() {
      zetta()
        .silent()
        .use(ExampleDevice)
        .use(function(server) {
          var ledQuery = server.where({ type: 'testdriver' });
          server.observe(ledQuery, function(led) {
            throw new Error('123');
          })
        })
        .listen(0);
    });
  });

  it('has the logger() function to pass in custom logging.', function(done) {
    var z = zetta({ registry: reg, peerRegistry: peerRegistry });
    z.logger(function(log) {
      log.on('message', function(level, event, msg, data) {
        assert.equal(level, 'info');
        assert.equal(event, 'custom');
        assert.equal(msg, 'some message');
        assert.equal(data.data, 1);
        done();
      });
      
      z.log.info('custom', 'some message', {data: 1});
    });
  });


  it('will load an app with the load() function', function(done) {
    zetta({ registry: reg, peerRegistry: peerRegistry })
      .silent()
      .load(function(server) {
        assert.ok(server);
        done();
      })
      ._initApps(function(){});
  });

  it('will load an app with the use() function', function(done) {
    zetta({ registry: reg, peerRegistry: peerRegistry })
      .silent()
      .use(function(server) {
        assert.ok(server);
        done();
      })
      ._initApps(function(){});
  });

  it('will load an app with the use() function and additional arguments', function(done) {
    var app = function(server, opts) {
      assert.ok(server);
      assert.ok(opts);
      assert.equal(opts.foo, 1);
      done();  
    }
    
    zetta({ registry: reg, peerRegistry: peerRegistry })
      .silent()
      .use(app, { foo: 1})
      ._initApps(function() {
        
      });

  });

  it('will load an app with the use() function and additional arguments', function(done) {
    var app = function(server, foo, bar) {
      assert.ok(server);
      assert.equal(foo, 1);
      assert.equal(bar, 2);
      done();  
    }
    
    zetta({ registry: reg, peerRegistry: peerRegistry })
      .silent()
      .use(app, 1, 2)
      ._initApps(function() {
        
      });

  });
  it('will load a driver with the use() function', function() {
    var z = zetta({ registry: reg, peerRegistry: peerRegistry }).silent();
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
    var z = zetta({ registry: reg, peerRegistry: peerRegistry }).silent();
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
    var z = zetta({ registry: reg, peerRegistry: peerRegistry }).silent();
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
    var z = zetta({ registry: reg, peerRegistry: peerRegistry }).silent();
    z.expose('*');

    assert.ok(z._exposeQuery);
  });

  it('will call init on the server prototype to ensure everything is wired up correctly.', function(done) {
    function MockHttp(){}
    MockHttp.prototype.init = function() {
      done();
    };
    MockHttp.prototype.listen = function(port) {};

    var z = zetta({ registry: reg, peerRegistry: peerRegistry }).silent();
    z.httpServer = new MockHttp();
    z.listen(0);

  });

  it('will apply arguments to httpServer when listen() is called', function(done) {
    function MockHttp(){}
    MockHttp.prototype.init = function(){};
    MockHttp.prototype.listen = function(port) {
      assert.equal(port, 0);
      done();
    };

    var z = zetta({ registry: reg, peerRegistry: peerRegistry }).silent();
    z.httpServer = new MockHttp();
    z.listen(0);

  });

  it('will correctly apply the callback to httpServer when listen() is called', function(done) {
    function MockHttp(){}
    MockHttp.prototype.init = function(){};
    MockHttp.prototype.listen = function(port, cb) {
      assert.equal(port, 0);
      cb(null);
    };

    var z = zetta({ registry: reg, peerRegistry: peerRegistry }).silent();
    z.httpServer = new MockHttp();
    z.listen(0, function(err) {
      assert.ok(!err);
      done();
    });
  });

  it('should initialize device with proper properties set.', function(done) {
    var z = zetta({ registry: reg, peerRegistry: peerRegistry })
      .silent()
      .use(ExampleDevice, 1, 'a')
      ._run(function(err) {
        if (err) {
          return done(err);
        }
        
        var device = z.runtime._jsDevices[Object.keys(z.runtime._jsDevices)[0]];
        device.call('change', done);
      });
  });

  it('should initialize 3 devices with correct params when using multiple use', function(done) {
    var z = zetta({ registry: reg, peerRegistry: peerRegistry })
      .silent()
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
      .silent()
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
          .silent()
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

  it('should only call .init once on a device driver with .use(Device)', function(done) {
    var called = 0;
    var oldInit = ExampleDevice.prototype.init;
    ExampleDevice.prototype.init = function(config) {
      called++;
      return oldInit.call(this, config);
    };

    var app = zetta({ peerRegistry: peerRegistry, registry: reg });
    app.silent();
    app.use(ExampleDevice);
    app.listen(0);
    setTimeout(function() {
      ExampleDevice.prototype.init = oldInit;
      assert.equal(called, 1);
      done();
    }, 10);
  });

  describe('peering', function() {
    it('.link should add to peers', function(done){
      var app = zetta({ peerRegistry: peerRegistry, registry: reg });
      app.silent();
      app.link('http://example.com/');
      app._initPeers(app._peers, function(err) {
        setTimeout(function() {
          assert.equal(app._peerClients.length, 1);
          done();
        }, 100);
      });
    });

    it('.link should not add to peers', function(done){

      peerRegistry.db.put('1234567', JSON.stringify({id: '1234567', direction: 'initiator', url: 'http://example.com/', fromLink: true}), function(err){
        var app = zetta({ peerRegistry: peerRegistry, registry: reg });
        app.silent();
        app._initPeers(app._peers, function(err) {
          setTimeout(function() {
            assert.equal(app._peerClients.length, 0);
            done();
          }, 100);
        });
      });
    });

    it('will delete fromLink peers in the registry', function(done) {
      peerRegistry.db.put('1234567', JSON.stringify({ id:'1234567', direction: 'initiator', url: 'http://example.com/', fromLink: true}), function(err) {
        var app = zetta({ peerRegistry: peerRegistry, registry: reg });
        app._initPeers(app._peers, function(err) {
          setTimeout(function(){
           assert.equal(app._peerClients.length, 0);
           peerRegistry.find(Query.of('peers'), function(err, results) {
             assert.equal(results.length, 0);
             done();
           }); 
          }, 100);  
        });
      });

    });

  it('will init API peers.', function(done){

      peerRegistry.db.put('1234567', JSON.stringify({id: '1234567', direction: 'initiator', url: 'http://example.com/'}), function(err){
        var app = zetta({ peerRegistry: peerRegistry, registry: reg });
        app.silent();
        app._initPeers(app._peers, function(err) {
          setTimeout(function() {
            assert.equal(app._peerClients.length, 1);
            done();
          }, 100);
        });
      });
    });

  });

  it('has the properties() function to add custom properties to the api.', function() {
    var z = zetta({ registry: reg, peerRegistry: peerRegistry });
    assert(typeof z.properties, 'function');
    z.properties({ test: 'abc' });
  });

  it('.getProperties() returns properties.', function() {
    var z = zetta({ registry: reg, peerRegistry: peerRegistry }).name('test');
    z.properties({ someKey: 123 });
    assert.deepEqual(z.getProperties(), { name: 'test', someKey: 123 });
  });

});
