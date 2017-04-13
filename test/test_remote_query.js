const assert = require('assert');
const http = require('http');
const zetta = require('../');
const zettacluster = require('zetta-cluster');
const Scout = require('./fixture/example_scout');
const ExampleDevice = require('./fixture/example_driver');
const VirtualDevice = require('../lib/virtual_device');
const LedJSON = require('./fixture/virtual_device.json');
const decompiler = require('calypso-query-decompiler');
const ZScout = require('zetta-scout');
const util = require('util');
const WebSocket = require('ws');
const MemRegistry = require('./fixture/mem_registry');
const MemPeerRegistry = require('./fixture/mem_peer_registry');


class FakeScout extends ZScout {
  constructor() {
    super();
  }

  init(cb) {cb();}
}


const mockSocket = {
  on() {},
  subscribe(topic, cb) {
    if(cb) {
      cb();
    }
  },
  unsubscribe() {}
};

describe('Remote queries', () => {
  let cluster = null;
  let detroit1 = null;
  let chicago = null;
  let cloud = null;
  let urlLocal = null;
  let urlProxied = null;
  let urlRoot = null;

  beforeEach(done => {
    cluster = zettacluster({ zetta })
      .server('cloud', [Scout])
      .server('detroit1', [Scout], ['cloud'])
      .server('chicago', [Scout], ['cloud'])
      .on('ready', () => {
        urlRoot = `localhost:${cluster.servers['cloud']._testPort}`;
        urlProxied = `localhost:${cluster.servers['cloud']._testPort}/servers/detroit1`;
        urlLocal = `localhost:${cluster.servers['detroit1']._testPort}/servers/detroit1`;

        detroit1 = cluster.servers['detroit1'];
        chicago = cluster.servers['chicago'];
        cloud = cluster.servers['cloud'];
        done();
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
  
  describe('remote query events', () => {

    it('should fire a remote query event on detroit1 after peers connect', done => {
      const query = cloud.runtime.from('detroit1').where({type: 'testdriver'});
      cloud.runtime.observe([query], testdriver => {
      });
      const key = Object.keys(cloud.runtime._remoteSubscriptions['detroit1'])[0];
      detroit1.pubsub.subscribe(key, () => {
        done();
      });
    });

    it('should fire remote query for both server detroit1 and chicago', done => {
      const query1 = cloud.runtime.from('detroit1').where({type: 'testdriver'});
      const query2 = cloud.runtime.from('chicago').where({type: 'testdriver'});
      cloud.runtime.observe([query1, query2], (d1, d2) => {
        done();
      });
    })

    it('should return devices from both Z1 and Z2 after peers connects', done => {
      const query1 = cloud.runtime.from('Z1').where({type: 'testdriver'});
      const query2 = cloud.runtime.from('Z2').where({type: 'testdriver'});
      cloud.runtime.observe([query1, query2], (d1, d2) => {
        done();
      });

      var z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() })
        .name('Z1')
        .use(Scout)
        .silent()
        .link(`http://${urlRoot}`)
        .listen(0);

      var z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() })
        .name('Z2')
        .use(Scout)
        .silent()
        .link(`http://${urlRoot}`)
        .listen(0);
    })

    it('should return all test devices when quering .from(\'*\')', done => {
      const query = cloud.runtime.from('*').where({type: 'testdriver'});
      let count = 0;
      cloud.runtime.observe(query, device => {
        count++;
        if (count === 2) {
          done();
        }
      });
    });
    
    it('should return all test devices from quering .from(\'*\') when a new peer connects', done => {
      const query = cloud.runtime.from('*').where({type: 'testdriver'});
      let count = 0;
      cloud.runtime.observe(query, device => {
        count++;
        if (count === 3) {
          done();
        }
      });

      const z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() })
        .name('local')
        .use(Scout)
        .silent()
        .link(`http://${urlRoot}`)
        .listen(0);
    })

    it('adding a device on the remote server should add a device to app with star query', done => {
      const query = cloud.runtime.from('*').where({type: 'testdriver'});
      let recv = 0;
      cloud.runtime.observe([query], testdriver => {
        recv++;
      });

      const detroit = cluster.servers['detroit1'];
      const scout = new FakeScout();
      scout.server = detroit.runtime;
      scout.discover(ExampleDevice);

      setTimeout(() => {
        assert.equal(recv, 3);
        done();
      }, 100);
    });

    it('should pass a remote query to peer socket through subscribe', done => {
      const query = cloud.runtime.from('detroit2').where({type: 'testdriver'});
      let ql = decompiler(query);
      const remove = 'select * ';
      if(ql.slice(0, remove.length) === remove) {
        ql = ql.slice(remove.length);
      }

      cloud.runtime.observe([query], testdriver => {
      });

      const sock = {
        subscribe() {},
        on(ev, data) {
          if(ev.indexOf('query:') === 0) {
            done();
          }
        },
        name: 'detroit2'
      };

      cloud.pubsub.publish('_peer/connect', { peer: sock });
    });

    it('adding a device on the remote server should add a device to app', done => {
      const query = cloud.runtime.from('detroit1').where({type: 'testdriver'});
      let recv = 0;
      cloud.runtime.observe([query], testdriver => {
        recv++;
      });

      const detroit = cluster.servers['detroit1'];
      const scout = new FakeScout();
      scout.server = detroit.runtime;
      scout.discover(ExampleDevice);

      setTimeout(() => {
        assert.equal(recv, 2);
        done();
      }, 100);
    });

  });

  describe('Peer Reconnects', () => {

    it('runtime should only pass the device once to app', done => {
      const query = cloud.runtime.from('detroit1').where({type: 'testdriver'});
      let recv = 0;
      cloud.runtime.observe([query], testdriver => {
        recv++;
      });
      
      const socket = cluster.servers['cloud'].httpServer.peers['detroit1'];
      setTimeout(() => {
        socket.close();
      }, 100);

      cloud.pubsub.subscribe('_peer/connect', (ev, data) => {
        if (data.peer.name === 'detroit1') {
          assert.equal(recv, 1);
          done();
        }
      });
    });

    it('runtime should ony pass the device once to app for each peer', done => {
      const query = cloud.runtime.from('*').where({type: 'testdriver'});
      let recv = 0;
      cloud.runtime.observe([query], testdriver => {
        recv++;
      });
      
      const socket = cluster.servers['cloud'].httpServer.peers['detroit1'];
      setTimeout(() => {
        socket.close();
      }, 100);

      cloud.pubsub.subscribe('_peer/connect', (ev, data) => {
        if (data.peer.name === 'detroit1') {
          assert.equal(recv, 2);
          done();
        }
      });
    })


    it('should send back 1 result for peer after a reconnet', done => {
      const socket = new WebSocket(`ws://${urlProxied}/events?topic=query/where type = "testdriver"`);
      let recv = 0;

      const socketP = cluster.servers['cloud'].httpServer.peers['detroit1'];
      setTimeout(() => {
        socketP.close();
        cloud.pubsub.subscribe('_peer/connect', (ev, data) => {
          if (data.peer.name === 'detroit1') {
            setTimeout(() => {
              assert.equal(recv, 1);
              done();
            }, 100);
          }
        });
      }, 100);

      socket.on('message', data => {
        const json = JSON.parse(data);
        // test links are properly set
        json.links.forEach(link => {
          assert(link.href.indexOf(urlProxied) > -1)
        });
        assert.equal(json.properties.type, 'testdriver');  
        recv++;
      });

      
    });
  });


  describe('Websocket Local Queries', () => {

    it('should send back 1 result for local device', done => {
      const socket = new WebSocket(`ws://${urlLocal}/events?topic=query/where type = "testdriver"`);
      socket.on('open', err => {
        socket.on('message', data => {
          const json = JSON.parse(data);
          // test links are properly set
          json.links.forEach(link => {
            assert(link.href.indexOf(urlLocal) > -1)
          });

          assert.equal(json.properties.type, 'testdriver');
          done();
        });
      });
    });

    it('should send back 2 results for local device after a device is added', done => {
      const socket = new WebSocket(`ws://${urlLocal}/events?topic=query/where type = "testdriver"`);
      socket.on('open', err => {
        let recv = 0;

        setTimeout(() => {
          const detroit = cluster.servers['detroit1'];
          const scout = new FakeScout();
          scout.server = detroit.runtime;
          scout.discover(ExampleDevice);
        }, 50);

        socket.on('message', data => {
          const json = JSON.parse(data);
          assert.equal(json.properties.type, 'testdriver');
          recv++;

          if (recv === 2) {
            done();
          }
        });
      });

    });

    it('reconnecting should only have 1 result', done => {
      const socket = new WebSocket(`ws://${urlLocal}/events?topic=query/where type = "testdriver"`);
      socket.on('open', err => {
        socket.on('message', data => {
          const json = JSON.parse(data);
          assert.equal(json.properties.type, 'testdriver');
          socket.close();

          const socket2 = new WebSocket(`ws://${urlLocal}/events?topic=query/where type = "testdriver"`);
          socket2.on('open', err => {
            socket2.on('message', data => {
              const json = JSON.parse(data);
              assert.equal(json.properties.type, 'testdriver');
              done();
            });
          });
          
        });
      });
    });

  });





  describe('Websocket Proxied Queries', () => {

    it('should send back 1 result for local device', done => {
      const socket = new WebSocket(`ws://${urlProxied}/events?topic=query/where type = "testdriver"`);
      socket.on('open', err => {
        socket.on('message', data => {
          const json = JSON.parse(data);

          // test links are properly set
          json.links.forEach(link => {
            assert(link.href.indexOf(urlProxied) > -1)
          });
          
          assert.equal(json.properties.type, 'testdriver');
          done();
        });
      });
    });

    it('should send back 2 results for local device after a device is added', done => {
      const socket = new WebSocket(`ws://${urlProxied}/events?topic=query/where type = "testdriver"`);
      socket.on('open', err => {
        let recv = 0;

        setTimeout(() => {
          const detroit = cluster.servers['detroit1'];
          const scout = new FakeScout();
          scout.server = detroit.runtime;
          scout.discover(ExampleDevice);
        }, 50);

        socket.on('message', data => {
          const json = JSON.parse(data);
          assert.equal(json.properties.type, 'testdriver');
          recv++;

          if (recv === 2) {
            done();
          }
        });
      });

    });

    it('reconnecting should only have 1 result', done => {
      const socket = new WebSocket(`ws://${urlProxied}/events?topic=query/where type = "testdriver"`);
      socket.on('open', err => {
        socket.on('message', data => {
          const json = JSON.parse(data);
          assert.equal(json.properties.type, 'testdriver');
          socket.close();

          const socket2 = new WebSocket(`ws://${urlProxied}/events?topic=query/where type = "testdriver"`);
          socket2.on('open', err => {
            socket2.on('message', data => {
              const json = JSON.parse(data);
              assert.equal(json.properties.type, 'testdriver');
              done();
            });
          });
          
        });
      });
    });

  });

  describe('Websocket Cross-Server Queries', () => {

    it('should send back 2 results', done => {
      const socket = new WebSocket(`ws://${urlRoot}/events?topic=query/where type = "testdriver"`);
      socket.on('open', err => {
        let count = 0;
        socket.on('message', data => {
          const json = JSON.parse(data);

          // test links are properly set
          json.links.forEach(link => {
            assert(link.href.indexOf(urlRoot) > -1)
          });
          
          assert.equal(json.properties.type, 'testdriver');
          count++;

          if (count == 2) {
            done();
          }
        });
      });
    });

    it('should send back 3 results after a device is added', done => {
      const socket = new WebSocket(`ws://${urlRoot}/events?topic=query/where type = "testdriver"`);
      socket.on('open', err => {
        let recv = 0;

        setTimeout(() => {
          const detroit = cluster.servers['detroit1'];
          const scout = new FakeScout();
          scout.server = detroit.runtime;
          scout.discover(ExampleDevice);
        }, 50);

        socket.on('message', data => {
          const json = JSON.parse(data);
          assert.equal(json.properties.type, 'testdriver');
          recv++;

          if (recv === 3) {
            done();
          }
        });
      });

    });
  });

});

