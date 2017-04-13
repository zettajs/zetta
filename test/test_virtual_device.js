const assert = require('assert');
const http = require('http');
const WebSocket = require('ws');
const zetta = require('../');
const zettacluster = require('zetta-cluster');
const Scout = require('./fixture/example_scout');
const VirtualDevice = require('../lib/virtual_device');
const LedJSON = require('./fixture/virtual_device.json');

const mockSocket = {
  on() {},
  subscribe(topic, cb) {
    if(cb) {
      cb();
    }
  },
  unsubscribe() {}
};

describe('Virtual Device', () => {
  let base = null;
  let cluster = null;
  let device = null;
  let socket = null;
  let deviceJson = null;
  let vdevice = null;

  const startPort = 2600;

  beforeEach(done => {
    cluster = zettacluster({ zetta: zetta })
      .server('cloud')
      .server('detroit1', [Scout], ['cloud'])
      .on('ready', () => {
        socket = cluster.servers['cloud'].httpServer.peers['detroit1'];        
        if (!socket) {
          done(new Error('socket not found'));
        }

        const did = Object.keys(cluster.servers['detroit1'].runtime._jsDevices)[0];
        device = cluster.servers['detroit1'].runtime._jsDevices[did];
        const id = cluster.servers['detroit1'].id;
        base = `localhost:${cluster.servers['cloud']._testPort}/servers/${cluster.servers['cloud'].locatePeer(id)}/devices/${did}`;

        http.get(`http://${base}`, res => {
          const buffer = [];
          let len = 0;
          res.on('readable', () => {
            let data;
            while (data = res.read()) {
              buffer.push(data);
              len += data.length;
            }
          });
          res.on('end', () => {
            const buf = Buffer.concat(buffer, len);
            deviceJson = JSON.parse(buf.toString());
            vdevice = new VirtualDevice(deviceJson, socket);
            vdevice.on('ready', () => {
              setTimeout(done, 100);
            });
          });
          res.on('error', err => {
            done(err);
          });
        })
      })
      .run(err => {
        if (err) {
          return done(err);
        }
      });
  });

  afterEach(done => {
    cluster.stop();
    setTimeout(done, 10); // fix issues with server not being closed before a new one starts
  });
  
  describe('.call method', () => {

    it('call should work without a callback function', done => {
      vdevice.call('change')
      const timer = setTimeout(() => {
        done(new Error('Faied to recv transition call on detroit device'));
      }, 100);

      device.on('change', () => {
        clearTimeout(timer);
        done();
      });
    });

    it('_update should always be called with data.actions in proper format', done => {
      let called = 0;
      const orig = vdevice._update;
      vdevice._update = function(data) {
        called++;
        assert(Array.isArray(data.actions));
        data.actions.forEach(action => {
          assert(action.class);
          assert(action.name);
          assert(action.method);
          assert(action.href);
          assert(action.fields);
        });
        orig.apply(vdevice, arguments);

        // _update is called twice on transitions. Once for the return of the transition http POST and again
        // for the log topic update.
        if (called === 2) {
          done();
        }
      };

      vdevice.call('change');
    });
    
    it('call should work without arguments', done => {
      vdevice.call('change', err => {
        assert.equal(err, null);
      });
      const timer = setTimeout(() => {
        done(new Error('Faied to recv transition call on detroit device'));
      }, 100);

      device.on('change', () => {
        clearTimeout(timer);
        done();
      });
    });

    it('call should work with arguments', done => {
      vdevice.call('test', 321, err => {
        assert.equal(err, null);
      });
      const timer = setTimeout(() => {
        done(new Error('Faied to recv transition call on detroit device'));
      }, 100);

      device.on('test', () => {
        clearTimeout(timer);
        assert.equal(device.value, 321);
        done();
      });
    });

    it('call should work with arguments, after peer reconnects', done => {

      const timer = setTimeout(() => {
        done(new Error('Faied to recv transition call on detroit device'));
      }, 1500);

      vdevice.call('test', 999, err => {
        assert.equal(err, null);

        clearTimeout(timer);
        assert.equal(device.value, 999);

        const socket = cluster.servers['cloud'].httpServer.peers['detroit1'];
        socket.close();

        setTimeout(() => {
          vdevice.call('test', 222, err => {
            assert.equal(err, null);
          });
          const timer = setTimeout(() => {
            done(new Error('Faied to recv transition call on detroit device'));
          }, 1500);

          device.on('test', () => {
            clearTimeout(timer);
            assert.equal(device.value, 222);
            done();
          });
        }, 1500);
      });

    });
  });

  describe('Device log monitor stream', () => {

    it('should update virtual devices state when detroit device updates', done => {    
      assert.equal(vdevice.state, 'ready');
      device.call('change', () => {
        assert.equal(device.state, 'changed');
        setTimeout(() => {
          assert.equal(vdevice.state, 'changed');
          done();
        }, 100);
      });
    });

    it('should update virtual devices state when virtual device calls transition', done => {    
      assert.equal(vdevice.state, 'ready');
      vdevice.call('change', () => {
        assert.equal(device.state, 'changed');
        setTimeout(() => {
          assert.equal(vdevice.state, 'changed');
          done();
        }, 100);
      });
    });

  });



  describe('Device monitor streams on properties', () => {

    it('should update virtual device when value increments locally', done => {    
      assert.equal(vdevice.bar, 0);
      assert.equal(device.bar, 0);
      device.incrementStreamValue();
      assert.equal(device.bar, 1);
      setTimeout(() => {
        assert.equal(vdevice.bar, 1);
        done();
      }, 100);
    });

    it('should implement .createReadStream() for object stream', done => {
      vdevice.createReadStream('bar').on('data', msg => {
        assert.equal(msg.data, 1);
        done();
      });

      setTimeout(() => {
        device.incrementStreamValue();
      }, 10);
    })

    it('should implement .createReadStream() for binary stream', done => {
      vdevice.createReadStream('foobar').on('data', buf => {
        assert.deepEqual(buf, new Buffer([1]));
        done();
      });
      setTimeout(() => {
        device.incrementFooBar();
      }, 10);
    })

    it('should recv data event after a client ws disconnected on the same topic', done => {
      
      const url = `ws://localhost:${cluster.servers['cloud']._testPort}/servers/detroit1/events?topic=testdriver%2F${device.id}%2Fbar`;

      let recv = 0;
      let wsRecv = 0;
      vdevice.streams.bar.on('data', data => {
        recv++;
      });
      
      device.incrementStreamValue();

      setTimeout(() => {
        assert.equal(recv, 1);
        const socket = new WebSocket(url);
        socket.on('message', () => {
          wsRecv++;
        });
        socket.on('open', () => {
          device.incrementStreamValue();
          setTimeout(() => {
            assert.equal(recv, 2);
            assert.equal(wsRecv, 1);

            socket.close();
            device.incrementStreamValue();
            setTimeout(() => {
              assert.equal(recv, 3);
              assert.equal(wsRecv, 1);
              done();
            }, 300);
          },300);
        });
        socket.on('error', done);

      }, 300);
    });

  });

  describe('Device binary streams', () => {

    it('should only subscribe to a binary stream if used', done => {    
      const topic = `${device.type}/${device.id}/foobar`;
      assert.equal(cluster.servers['detroit1'].pubsub._listeners[topic], undefined);
      vdevice.streams.foobar.on('data', () => {});
      setTimeout(() => {
        assert.notEqual(cluster.servers['detroit1'].pubsub._listeners[topic], undefined);
        done();
      }, 100);
    });

    it('should pass binary data from local device to virtual', done => {    
      let recv = 0;
      vdevice.streams.foobar.on('data', data => {
        recv++;
        assert.deepEqual(data, new Buffer([recv]));
      });

      setTimeout(() => {
        device.incrementFooBar();
        device.incrementFooBar();
        device.incrementFooBar();

        setTimeout(() => {          
          assert.equal(recv, 3);
          done();
        }, 100);
      }, 100);
    });

  });



  describe('basic unit tests', () => {

    let device = null;
    beforeEach(() => {
      device = new VirtualDevice(LedJSON , mockSocket);
    });
      
    it('wires up logs, properties, and actions', () => {
      assert.equal(device.state, 'off');
      assert.equal(Object.keys(device.streams).length, 2);
    });

    it('will change properties with update.', () => {
      device._update({ properties: {state: 'on'}});
      assert.equal(device.state, 'on');
    });

    it('will return the proper action given a name', () => {
      const action = device._getAction('turn-on');
      assert.ok(action);
      assert.equal(action.name, 'turn-on');
      assert.equal(action.fields.length, 1);
    });

    it('will return link given a title', () => {
      const link = device._getLinkWithTitle('state');
      assert.ok(link);
      assert.equal(link.title, 'state');
      assert.equal(link.rel[0], 'monitor');
      assert.equal(link.rel[1], 'http://rels.zettajs.io/object-stream');
    });

    it('will return an array of links if searched for by rel', () => {
      const links = device._getLinksWithRel('http://rels.zettajs.io/object-stream');
      assert.ok(links);
      assert.equal(links.length, 2);
      assert.ok(Array.isArray(links));
    });

    it('will parse out a topic for a particular link', () => {
      const link = device._getLinkWithTitle('state');
      const topic = device._getTopic(link);
      assert.equal(topic, 'led/0eaf8607-5b8c-45ee-afae-9a5f9e1f34e2/state');
    });

    it('will encode transition arguments into an object', () => {
      const action = device._getAction('turn-on');
      const data = device._encodeData(action, {});
      assert.ok(data);
      assert.equal(Object.keys(data)[0], 'action');
      assert.equal(data.action, 'turn-on');
    });

    it('exposes .available() method', () => {
      assert.equal(typeof device.available, 'function');
      assert.equal(device.available('turn-on'), true);
      assert.equal(device.available('turn-off'), false);
    });
  });

});

