const assert = require('assert');
const util = require('util');
const fs = require('fs');
const https = require('https');
const zetta = require('../zetta');
const WebSocket = require('ws');
const MemRegistry = require('./fixture/mem_registry');
const MemPeerRegistry = require('./fixture/mem_peer_registry');

const Device = require('zetta-device');
const HttpDevice = require('zetta-http-device');
const Scout = require('zetta-scout');
const ExampleDevice = require('./fixture/example_driver');
const Query = require('calypso').Query;

describe('Zetta', () => {
  let reg = null;
  let peerRegistry = null;

  beforeEach(() => {
    reg = new MemRegistry();
    peerRegistry = new MemPeerRegistry();
  });

  it('should be attached to the zetta as a function', () => {
    assert.equal(typeof zetta, 'function');
  });

  it('has the name set using the name() function.', () => {
    const z = zetta({ registry: reg, peerRegistry }).name('local').silent();
    assert.equal(z._name, 'local');
  });

  it('should throw error if setting name to *', () => {
    assert.throws(() => {
      const z = zetta({ registry: reg, peerRegistry }).name('*').silent();
    }, Error);
  });

  it('has the silent() function to suppress logging.', () => {
    const z = zetta({ registry: reg, peerRegistry }).name('local').silent();
  });

  it('errors thrown in zetta apps should propagate.', done => {
    const d = require('domain').create();
    d.on('error', err => {
      assert.equal(err.message, '123');
      d.dispose()
      done();
    });
    d.run(() => {
      zetta()
        .silent()
        .use(ExampleDevice)
        .use(server => {
          const ledQuery = server.where({ type: 'testdriver' });
          server.observe(ledQuery, led => {
            throw new Error('123');
          })
        })
        .listen(0);
    });
  });

  it('support tls options for https server', done => {
    const options = {
      key: fs.readFileSync(`${__dirname}/fixture/keys/key.pem`),
      cert: fs.readFileSync(`${__dirname}/fixture/keys/cert.pem`)
    };
    
    const z = zetta({ registry: reg, peerRegistry, tls: options })
      .silent()
      .listen(0, err => {
        if (err) return done(err);

        const port = z.httpServer.server.address().port;
        const req = https.get({
          host: 'localhost',
          port,
          path: '/',
          rejectUnauthorized: false
        }, res => {
          assert.equal(res.statusCode, 200);
          done();
        });
        req.on('error', done);
      });
  });

  it('has the logger() function to pass in custom logging.', done => {
    const z = zetta({ registry: reg, peerRegistry });
    z.logger(log => {
      log.on('message', (level, event, msg, data) => {
        assert.equal(level, 'info');
        assert.equal(event, 'custom');
        assert.equal(msg, 'some message');
        assert.equal(data.data, 1);
        done();
      });
      
      z.log.info('custom', 'some message', {data: 1});
    });
  });


  it('will load an app with the load() function', done => {
    zetta({ registry: reg, peerRegistry })
      .silent()
      .load(server => {
        assert.ok(server);
        done();
      })
      ._initApps(() => {});
  });

  it('will load an app with the use() function', done => {
    zetta({ registry: reg, peerRegistry })
      .silent()
      .use(server => {
        assert.ok(server);
        done();
      })
      ._initApps(() => {});
  });

  it('will load an app with the use() function and additional arguments', done => {
    const app = (server, opts) => {
      assert.ok(server);
      assert.ok(opts);
      assert.equal(opts.foo, 1);
      done();  
    };
    
    zetta({ registry: reg, peerRegistry })
      .silent()
      .use(app, { foo: 1})
      ._initApps(() => {
        
      });

  });

  it('will load an app with the use() function and additional arguments', done => {
    const app = (server, foo, bar) => {
      assert.ok(server);
      assert.equal(foo, 1);
      assert.equal(bar, 2);
      done();  
    };
    
    zetta({ registry: reg, peerRegistry })
      .silent()
      .use(app, 1, 2)
      ._initApps(() => {
        
      });

  });
  it('will load a driver with the use() function', () => {
    const z = zetta({ registry: reg, peerRegistry }).silent();
    function TestDriver() {
      Device.call(this);
    }
    util.inherits(TestDriver, Device);

    TestDriver.prototype.init = () => {};

    z.use(TestDriver);
    const s = z._scouts[0];
    assert.equal(s.server, z.runtime);
  });

  it('will load an HTTP driver with the use() function', () => {
    const z = zetta({ registry: reg, peerRegistry }).silent();
    function TestDriver() {
      HttpDevice.call(this);
    }
    util.inherits(TestDriver, HttpDevice);

    TestDriver.prototype.init = () => {};

    z.use(TestDriver);
    const s = z._scouts[0];
    assert.equal(s.server, z.runtime);
  });

  it('will load a scout with the use() function', () => {
    const z = zetta({ registry: reg, peerRegistry }).silent();
    function TestScout() {
      Scout.call(this);
    }
    util.inherits(TestScout, Scout);
    z.use(TestScout);
    assert.equal(z._scouts.length, 2);
    const s = z._scouts[0];
    assert.equal(s.server, z.runtime);
  });

  it('will set the what query is used for expose()', () => {
    const z = zetta({ registry: reg, peerRegistry }).silent();
    z.expose('*');

    assert.ok(z._exposeQuery);
  });

  it('will call init on the server prototype to ensure everything is wired up correctly.', done => {
    function MockHttp(){}
    MockHttp.prototype.init = () => {
      done();
    };
    MockHttp.prototype.listen = port => {};

    const z = zetta({ registry: reg, peerRegistry }).silent();
    z.httpServer = new MockHttp();
    z.listen(0);

  });

  it('will apply arguments to httpServer when listen() is called', done => {
    function MockHttp(){}
    MockHttp.prototype.init = () => {};
    MockHttp.prototype.listen = port => {
      assert.equal(port, 0);
      done();
    };

    const z = zetta({ registry: reg, peerRegistry }).silent();
    z.httpServer = new MockHttp();
    z.listen(0);

  });

  it('will correctly apply the callback to httpServer when listen() is called', done => {
    function MockHttp(){}
    MockHttp.prototype.init = () => {};
    MockHttp.prototype.listen = (port, cb) => {
      assert.equal(port, 0);
      cb(null);
    };

    const z = zetta({ registry: reg, peerRegistry }).silent();
    z.httpServer = new MockHttp();
    z.listen(0, err => {
      assert.ok(!err);
      done();
    });
  });

  it('should initialize device with proper properties set.', done => {
    const z = zetta({ registry: reg, peerRegistry })
      .silent()
      .use(ExampleDevice, 1, 'a')
      ._run(err => {
        if (err) {
          return done(err);
        }
        
        const device = z.runtime._jsDevices[Object.keys(z.runtime._jsDevices)[0]];
        device.call('change', done);
      });
  });

  it('should initialize 3 devices with correct params when using multiple use', done => {
    const z = zetta({ registry: reg, peerRegistry })
      .silent()
      .use(ExampleDevice, 1, 'a')
      .use(ExampleDevice, 2, 'b')
      .use(ExampleDevice, 3, 'c')
      ._run(err => {
        if (err) {
          return done(err);
        }

        const find = (x, y) => Object.keys(z.runtime._jsDevices).some(key => {
          const device = z.runtime._jsDevices[key];
          return device._x === x && device._y === y;
        });

        assert(find(1, 'a'));
        assert(find(2, 'b'));
        assert(find(3, 'c'));

        done();
      });
  });



  it('should provision 3 devices already in registry with correct params when using multiple use', done => {
    const z = zetta({ registry: reg, peerRegistry })
      .silent()
      .use(ExampleDevice, 1, 'a')
      .use(ExampleDevice, 2, 'b')
      .use(ExampleDevice, 3, 'c')
      ._run(err => {
        if (err) {
          return done(err);
        }

        const find = (x, y) => {
          let id = null;
          Object.keys(z.runtime._jsDevices).some(key => {
            const device = z.runtime._jsDevices[key];
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

        const z2 = zetta({ registry: reg, peerRegistry })
          .silent()
          .use(ExampleDevice, 1, 'a')
          .use(ExampleDevice, 2, 'b')
          .use(ExampleDevice, 3, 'c')
          ._run(err => {
            if (err) {
              return done(err);
            }

            const find2 = (id, x, y) => Object.keys(z2.runtime._jsDevices).some(key => {
              const device = z2.runtime._jsDevices[key];
              return device.id === id && device._x === x && device._y === y;
            });

            assert(find2(find(1, 'a'), 1, 'a'));
            assert(find2(find(2, 'b'), 2, 'b'));
            assert(find2(find(3, 'c'), 3, 'c'));
            done();
          });
      });
  });

  it('should only call .init once on a device driver with .use(Device)', done => {
    let called = 0;
    const oldInit = ExampleDevice.prototype.init;
    ExampleDevice.prototype.init = function(config) {
      called++;
      return oldInit.call(this, config);
    };

    const app = zetta({ peerRegistry, registry: reg });
    app.silent();
    app.use(ExampleDevice);
    app.listen(0);
    setTimeout(() => {
      ExampleDevice.prototype.init = oldInit;
      assert.equal(called, 1);
      done();
    }, 10);
  });

  describe('peering', () => {
    it('.link should add to peers', done => {
      const app = zetta({ peerRegistry, registry: reg });
      app.silent();
      app.link('http://example.com/');
      app._initPeers(app._peers, err => {
        setTimeout(() => {
          assert.equal(app._peerClients.length, 1);
          done();
        }, 100);
      });
    });

    it('peerOptions in httpServer should update options in PeerSockets', done => {
      const z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
      z.silent();
      z.use(server => {
        server.httpServer.peerOptions = {
          pingTimeout: 4321,
          confirmationTimeout: 1234
        };
        server.pubsub.subscribe('_peer/connect', (topic, data) => {
          assert.equal(data.peer._pingTimeout, 4321);
          assert.equal(data.peer._confirmationTimeout, 1234);
          done();
        })
      })
      z.listen(0, () => {
        const port = z.httpServer.server.address().port;
        zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() })
          .silent()
          .link(`http://localhost:${port}`)
          .listen(0);
      })
    })

    it('.link should not add to peers', done => {

      peerRegistry.db.put('1234567', JSON.stringify({id: '1234567', direction: 'initiator', url: 'http://example.com/', fromLink: true}), err => {
        const app = zetta({ peerRegistry, registry: reg });
        app.silent();
        app._initPeers(app._peers, err => {
          setTimeout(() => {
            assert.equal(app._peerClients.length, 0);
            done();
          }, 100);
        });
      });
    });

    it('will delete fromLink peers in the registry', done => {
      peerRegistry.db.put('1234567', JSON.stringify({ id:'1234567', direction: 'initiator', url: 'http://example.com/', fromLink: true}), err => {
        const app = zetta({ peerRegistry, registry: reg });
        app._initPeers(app._peers, err => {
          setTimeout(() => {
           assert.equal(app._peerClients.length, 0);
           peerRegistry.find(Query.of('peers'), (err, results) => {
             assert.equal(results.length, 0);
             done();
           }); 
          }, 100);  
        });
      });

    });

  it('will init API peers.', done => {

      peerRegistry.db.put('1234567', JSON.stringify({id: '1234567', direction: 'initiator', url: 'http://example.com/'}), err => {
        const app = zetta({ peerRegistry, registry: reg });
        app.silent();
        app._initPeers(app._peers, err => {
          setTimeout(() => {
            assert.equal(app._peerClients.length, 1);
            done();
          }, 100);
        });
      });
    });

  });

  it('has the properties() function to add custom properties to the api.', () => {
    const z = zetta({ registry: reg, peerRegistry });
    assert(typeof z.properties, 'function');
    z.properties({ test: 'abc' });
  });

  it('.getProperties() returns properties.', () => {
    const z = zetta({ registry: reg, peerRegistry }).name('test');
    z.properties({ someKey: 123 });
    assert.deepEqual(z.getProperties(), { name: 'test', someKey: 123 });
  });


  describe('HTTP Server Websocket connect hooks', () => {
    it('peer connect hook will fire when peer connects', done => {
      let fired = false;
      const z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
      z.silent();
      z.use(server => {
        server.httpServer.onPeerConnect((request, socket, head, next) => {
          fired = true;
          next();
        })
      })
      z.listen(0, () => {
        const port = z.httpServer.server.address().port;
        zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() })
          .silent()
          .use(server => {
            server.pubsub.subscribe('_peer/connect', (topic, data) => {
              assert.equal(fired, true);
              done();
            })
          })
          .link(`http://localhost:${port}`)
          .listen(0);
      })
    })

    it('websocket connect hook will fire when clients connects', done => {
      let fired = false;
      const z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
      z.silent();
      z.use(server => {
        server.httpServer.onEventWebsocketConnect((request, socket, head, next) => {
          fired = true;
          next();
        })
      })
      z.listen(0, () => {
        const port = z.httpServer.server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}/events`);
        ws.once('open', () => {
          assert.equal(fired, true);
          done();
        })
      });
    })

    it('multiple hooks will fire in order for peer connects', done => {
      const fired = [];
      const z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
      z.silent();
      z.use(server => {
        server.httpServer.onPeerConnect((request, socket, head, next) => {
          fired.push(1);
          next();
        })
        server.httpServer.onPeerConnect((request, socket, head, next) => {
          fired.push(2);
          next();
        })
      })
      z.listen(0, () => {
        const port = z.httpServer.server.address().port;
        zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() })
          .silent()
          .use(server => {
            server.pubsub.subscribe('_peer/connect', (topic, data) => {
              assert.deepEqual(fired, [1, 2]);
              done();
            })
          })
          .link(`http://localhost:${port}`)
          .listen(0);
      })
    })

    it('multiple hooks will fire in order for websocket connects', done => {
      const fired = [];
      const z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
      z.silent();
      z.use(server => {
        server.httpServer.onEventWebsocketConnect((request, socket, head, next) => {
          fired.push(1);
          next();
        })
        server.httpServer.onEventWebsocketConnect((request, socket, head, next) => {
          fired.push(2);
          next();
        })
      })
      z.listen(0, () => {
        const port = z.httpServer.server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}/events`);
        ws.once('open', () => {
          assert.deepEqual(fired, [1, 2]);
          done();
        })
      });
    })

    it('returning an error from hook will result in a 500 on peer connect', done => {
      const z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
      z.silent();
      z.use(server => {
        server.httpServer.onPeerConnect((request, socket, head, next) => {
          next(new Error('Error 123'));
        })
      })
      z.listen(0, () => {
        const port = z.httpServer.server.address().port;
        zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() })
          .silent()
          .use(server => {
            server.onPeerResponse(req => req.map(env => {
              assert.equal(env.response.statusCode, 500);
              done();
              return env;
            }));
          })
          .link(`http://localhost:${port}`)
          .listen(0);
      })
    })

    it('returning an error from hook will result in a 500 on websocket connect', done => {
      const z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
      z.silent();
      z.use(server => {
        server.httpServer.onEventWebsocketConnect((request, socket, head, next) => {
          next(new Error('test error'));
        })
      })
      z.listen(0, () => {
        const port = z.httpServer.server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}/events`);
        ws.once('error', err => {
          assert.equal(err.message, 'unexpected server response (500)');
          done();
        })
      });
    })
  });

});
