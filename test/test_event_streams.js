const assert = require('assert');
const WebSocket = require('ws');
const zetta = require('./..');
const zettacluster = require('zetta-cluster');
const Driver = require('./fixture/example_driver');
const MemRegistry = require('./fixture/mem_registry');
const MemPeerRegistry = require('./fixture/mem_peer_registry');

describe('Peering Event Streams', () => {
  let cloud = null;
  let cloudUrl = null;
  const baseUrl = '/events';
  
  beforeEach(done => {
    cloud = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
    cloud.silent();
    cloud.listen(0, err => {
      if(err) {
        return done(err);  
      } 
      cloudUrl = `http://localhost:${cloud.httpServer.server.address().port}`;
      done(); 
    });
  });
  
  afterEach(done => {
    cloud.httpServer.server.close();
    done();
  });
  
  it('will receive a _peer/connect event when subscribed', done => {
    const z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
    z.silent();
    z.listen(0, err => {
      if(err) {
        return done(err);  
      }  
      const zPort = z.httpServer.server.address().port;
      const endpoint = `localhost:${zPort}`;
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic: '_peer/connect' };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, '_peer/connect');
            assert(json.subscriptionId);
          } else if(json.type === 'event') {
            assert.equal(json.topic, '_peer/connect');
            done();
          }
        });
      });
      ws.on('error', done);
      z.link(cloudUrl);
    });
  });

  it('will receive a _peer/connect event when subscribed to **', done => {
    const z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
    z.silent();
    z.listen(0, err => {
      if(err) {
        return done(err);  
      }
      const zPort = z.httpServer.server.address().port;
      const endpoint = `localhost:${zPort}`;
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic: '**' };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, '**');
            assert(json.subscriptionId);
          } else if(json.type === 'event') {
            assert.equal(json.topic, '_peer/connect');
            done();
          }
        });
      });
      ws.on('error', done);
      z.link(cloudUrl);
    });
  });


  it('will receive a _peer/disconnect event when subscribed', done => {
    const z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
    z.silent();
    z.pubsub.subscribe('_peer/connect', (topic, data) => {
       const peer = data.peer; 
       peer.close();
    });
    z.listen(0, err => {
      if(err) {
        return done(err);  
      }  
      const zPort = z.httpServer.server.address().port;
      const endpoint = `localhost:${zPort}`;
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic: '_peer/disconnect' };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, '_peer/disconnect');
            assert(json.subscriptionId);
          } else if(json.type === 'event') {
            assert.equal(json.topic, '_peer/disconnect');
            done();
          }
        });
      });
      ws.on('error', done);
      z.link(cloudUrl);
    });
  });  

  it('will receive a _peer/connect event when subscribed with wildcards', done => {
    const z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
    z.silent();
    z.pubsub.subscribe('_peer/connect', (topic, data) => {
       const peer = data.peer; 
    });
    z.listen(0, err => {
      if(err) {
        return done(err);  
      }  
      const zPort = z.httpServer.server.address().port;
      const endpoint = `localhost:${zPort}`;
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic: '_peer/*' };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, '_peer/*');
            assert(json.subscriptionId);
          } else if(json.type === 'event') {
            assert.equal(json.topic, '_peer/connect');
            done();
          }
        });
      });
      ws.on('error', done);
      z.link(cloudUrl);
    });
  }); 
  it('will receive a _peer/connect and _peer/disconnect event when subscribed with wildcards', done => {
    const z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
    z.silent();
    z.pubsub.subscribe('_peer/connect', (topic, data) => {
       const peer = data.peer; 
       peer.close();
    });
    let recv = 0;
    z.listen(0, err => {
      if(err) {
        return done(err);  
      }  
      const zPort = z.httpServer.server.address().port;
      const endpoint = `localhost:${zPort}`;
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic: '_peer/*' };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, '_peer/*');
            assert(json.subscriptionId);
          } else if(json.type === 'event') {
            recv++;
            if(recv == 1) {
              assert.equal(json.topic, '_peer/connect');
            } else if(recv == 2) {
              assert.equal(json.topic, '_peer/disconnect');
              done();  
            }
            
          }
        });
      });
      ws.on('error', done);
      z.link(cloudUrl);
    });
  });
});

describe('Event Streams', () => {
  let cluster = null;
  let urls = [];
  const baseUrl = '/events';
  let devices = [];
  let validTopics = [];
  
  beforeEach(done => {
    urls = [];
    devices = [];
    validTopics = [];
    cluster = zettacluster({ zetta })
      .server('cloud')
      .server('hub', [Driver, Driver], ['cloud'])
      .server('hub2', [Driver, Driver], ['cloud'])
      .on('ready', () => {
        const app = cluster.servers['cloud'];
        urls.push(`localhost:${cluster.servers['cloud']._testPort}`);
        urls.push(`localhost:${cluster.servers['hub']._testPort}`);
        
        ['hub', 'hub2'].forEach(hubname => {
          Object.keys(cluster.servers[hubname].runtime._jsDevices).forEach(id => {
            const device = cluster.servers[hubname].runtime._jsDevices[id];
            devices.push(device);
            validTopics.push(`${hubname}/${device.type}/${device.id}/state`);
          });
        })
        done();
      })
      .run(err => {
        if (err) {
          return done(err);
        }
      });
  });

  afterEach(() => {
    cluster.stop();
  });

  describe('Websocket API', () => {
    const itBoth = (testMsg, test) => {
      it(`for cloud, ${testMsg}`, test.bind(null, 0));
      it(`for hub, ${testMsg}`, test.bind(null, 1));
    };

    itBoth('subscribing to a topic receives a subscription-ack', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic: 'hub/led/1234/state' };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          assert.equal(json.type, 'subscribe-ack');
          assert(json.timestamp);
          assert.equal(json.topic, 'hub/led/1234/state');
          assert(json.subscriptionId);
          done();
        });
      });
      ws.on('error', done);
    });

    itBoth('sending ping request will return a pong response without data field', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      ws.on('open', () => {
        const msg = { type: 'ping'};
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          assert.equal(json.type, 'pong');
          assert(json.timestamp);
          assert.equal(json.data, undefined);
          done();
        });
      });
      ws.on('error', done);
    });

    itBoth('sending ping request will return a pong response with data field', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      ws.on('open', () => {
        const msg = { type: 'ping', data: 'Application data'};
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          assert.equal(json.type, 'pong');
          assert(json.timestamp);
          assert.equal(json.data, 'Application data');
          done();
        });
      });
      ws.on('error', done);
    });

    itBoth('unsubscribing to a topic receives a unsubscription-ack', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic: 'hub/led/1234/state' };
        ws.send(JSON.stringify(msg));
        ws.once('message', buffer => {
          const json = JSON.parse(buffer);
          const msg = { type: 'unsubscribe', subscriptionId: json.subscriptionId };
          ws.send(JSON.stringify(msg));
          ws.on('message', buffer => {
            const json2 = JSON.parse(buffer);  
            assert.equal(json2.type, 'unsubscribe-ack');
            assert(json2.timestamp);
            assert.equal(json2.subscriptionId, json.subscriptionId);
            done();
          });       
        });
      });
      ws.on('error', done);
    });

    itBoth('verify error message format', () => {});

    itBoth('specific topic subscription only receives messages with that topic', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let subscriptionId = null;
      const topic = validTopics[0];
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;

            setTimeout(() => {
              devices[1].call('change');
              devices[0].call('change');
            }, 50);
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert.equal(json.subscriptionId, subscriptionId);
            assert(json.data);
            done();
          }
        });
      });
      ws.on('error', done);
    });

    itBoth('multiple clients specific topic subscription only receives messages with that topic', (idx, done) => {
      const endpoint = urls[idx];
      const topic = validTopics[0];
      
      let connected = 0;
      let recv = 0;

      const ws1 = new WebSocket(`ws://${endpoint}${baseUrl}`);
      ws1.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws1.send(JSON.stringify(msg));
        let subscriptionId = null;
        ws1.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            connected++;
            subscriptionId = json.subscriptionId;
            if (connected === 2) {
              setTimeout(() => {
                devices[1].call('change');
                devices[0].call('change');
              }, 50);
            }
          } else {
            assert.equal(json.topic, topic);
            assert.equal(json.subscriptionId, subscriptionId);
            recv++;
            if (recv === 2) {
              done();
            }
          }
        });
      });
      ws1.on('error', done);

      const ws2 = new WebSocket(`ws://${endpoint}${baseUrl}`);
      ws2.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws2.send(JSON.stringify(msg));
        let subscriptionId = null;
        ws2.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            subscriptionId = json.subscriptionId;
            connected++;
            if (connected === 2) {
              setTimeout(() => {
                devices[0].call('change');
              }, 50);
            }
          } else {
            assert.equal(json.topic, topic);
            assert.equal(json.subscriptionId, subscriptionId);
            recv++;
            if (recv === 2) {
              done();
            }
          }
        });
      });
      ws2.on('error', done);
    });

    itBoth('multiple clients using different topic subscriptions only receive one message per event', (idx, done) => {
      const endpoint = urls[idx];
      const topic = validTopics[0];
      
      let connected = 0;
      let recv1 = 0;

      const ws1 = new WebSocket(`ws://${endpoint}${baseUrl}`);
      ws1.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws1.send(JSON.stringify(msg));
        let subscriptionId = null;
        ws1.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            connected++;
            subscriptionId = json.subscriptionId;
            if (connected === 2) {
              setTimeout(() => {
                devices[0].call('change');
              }, 50);
            }
          } else {
            assert.equal(json.topic, topic);
            assert.equal(json.subscriptionId, subscriptionId);
            recv1++;
          }
        });
      });
      ws1.on('error', done);

      let recv2 = 0;
      const ws2 = new WebSocket(`ws://${endpoint}${baseUrl}`);
      ws2.on('open', () => {
        const msg = { type: 'subscribe', topic: 'hub/testdriver/*/state' };
        ws2.send(JSON.stringify(msg));
        let subscriptionId = null;
        ws2.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            subscriptionId = json.subscriptionId;
            connected++;
            if (connected === 2) {
              setTimeout(() => {
                devices[0].call('change');
              }, 50);
            }
          } else {
            assert.equal(json.topic, topic);
            assert.equal(json.subscriptionId, subscriptionId);
            recv2++;
          }
        });
      });
      ws2.on('error', done);

      setTimeout(() => {
        assert.equal(recv1, 1);
        assert.equal(recv2, 1);
        done();
      }, 250);
    });

    itBoth('wildcard server topic subscription only receives messages with that topic', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let subscriptionId = null;
      let topic = validTopics[0];
      topic = topic.replace('hub', '*');
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;

            setTimeout(() => {
              devices[1].call('change');
              devices[0].call('change');
            }, 50);
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert.equal(json.topic, validTopics[0]);
            assert.equal(json.subscriptionId, subscriptionId);
            assert(json.data);
            done();
          }
        });
      });
      ws.on('error', done);
    });

    itBoth('wildcard topic and static topic subscription will receive messages for both subscriptions', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let lastSubscriptionId = null;
      let count = 0;
      ws.on('open', () => {
        let msg = { type: 'subscribe', topic: validTopics[0] };
        ws.send(JSON.stringify(msg));
        msg = { type: 'subscribe', topic: 'hub/testdriver/*/state' };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert(json.subscriptionId);
            setTimeout(() => {
              devices[0].call('change');
            }, 50);
          } else {
            count++;
            assert.notEqual(lastSubscriptionId, json.subscriptionId);
            lastSubscriptionId = json.subscriptionId;
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert.equal(json.topic, validTopics[0]);
            assert(json.data);
            if (count === 2) {
              done();
            }
          }
        });
      });
      ws.on('error', done);
    });

    itBoth('wildcard device id topic subscription and cloud app query both will recieve data', (idx, done) => {
      const endpoint = urls[idx];
      let subscriptionId = null;
      const topic = 'hub/testdriver/*/state';

      const runtime = cluster.servers['cloud'].runtime;
      const query = runtime.from('hub').where({ type: 'testdriver', id: devices[0].id });
      runtime.observe(query, device => {
        const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
        ws.on('open', () => {
          const msg = { type: 'subscribe', topic };
          ws.send(JSON.stringify(msg));
          ws.on('message', buffer => {
            const json = JSON.parse(buffer);
            if(json.type === 'subscribe-ack') {
              assert.equal(json.type, 'subscribe-ack');
              assert(json.timestamp);
              assert.equal(json.topic, topic);
              assert(json.subscriptionId);
              subscriptionId = json.subscriptionId;

              setTimeout(() => {
                devices[0].call('change');
              }, 50);
            } else {
              assert.equal(json.type, 'event');
              assert(json.timestamp);
              assert.equal(json.topic, validTopics[0]);
              assert.equal(json.subscriptionId, subscriptionId);
              assert(json.data);
              done();
            }
          });
        });
        ws.on('error', done);
      });
    });

    itBoth('wildcard device id topic subscription and hub app query both will recieve data', (idx, done) => {
      const endpoint = urls[idx];
      let subscriptionId = null;
      const topic = 'hub/testdriver/*/state';

      const runtime = cluster.servers['hub'].runtime;
      const query = runtime.where({ type: 'testdriver', id: devices[0].id });
      runtime.observe(query, device => {
        const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
        ws.on('open', () => {
          const msg = { type: 'subscribe', topic };
          ws.send(JSON.stringify(msg));
          ws.on('message', buffer => {
            const json = JSON.parse(buffer);
            if(json.type === 'subscribe-ack') {
              assert.equal(json.type, 'subscribe-ack');
              assert(json.timestamp);
              assert.equal(json.topic, topic);
              assert(json.subscriptionId);
              subscriptionId = json.subscriptionId;

              setTimeout(() => {
                devices[0].call('change');
              }, 50);
            } else {
              assert.equal(json.type, 'event');
              assert(json.timestamp);
              assert.equal(json.topic, validTopics[0]);
              assert.equal(json.subscriptionId, subscriptionId);
              assert(json.data);
              done();
            }
          });
        });
        ws.on('error', done);
      });
    });

    it('wildcard server topic subscription receives messages from both hubs', done => {
      const endpoint = urls[0];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let subscriptionId = null;
      const topic = '*/testdriver/*/state';
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws.send(JSON.stringify(msg));
        let recv = 0;
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;

            setTimeout(() => {
              devices[0].call('change');
              devices[2].call('change');
            }, 50);
          } else {
            recv++;
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert.equal(json.subscriptionId, subscriptionId);
            assert(json.data);
            if (recv === 2) {
              done();
            }
          }
        });
      });
      ws.on('error', done);
    });
    
    it('wildcard topic ** will subscribe to all topics for both hubs', done => {
      const endpoint = urls[0]; // cloud
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let subscriptionId = null;
      const topic = '**';

      const neededTopics = [];
      devices.forEach((device, idx) => {
        const server = (idx < 2) ? 'hub' : 'hub2';
        neededTopics.push(`${server}/${device.type}/${device.id}/state`);
        neededTopics.push(`${server}/${device.type}/${device.id}/logs`);
      });

      ws.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;

            setTimeout(() => {
              devices[0].call('change');
              devices[1].call('change');
              devices[2].call('change');
              devices[3].call('change');
            }, 250);
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert.equal(json.subscriptionId, subscriptionId);
            assert(json.data);
            const idx = neededTopics.indexOf(json.topic);
            assert.notEqual(idx, -1);
            neededTopics.splice(idx, 1);
            if (neededTopics.length === 0) {
              done();
            }
          }
        });
      });
      ws.on('error', done);
    });

    it('wildcard topic ** will subscribe to all topics for single hub', done => {
      const endpoint = urls[1]; // hub
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let subscriptionId = null;
      const topic = '**';

      const neededTopics = [];
      for (let i=0; i<2; i++) {
        const device = devices[i];
        neededTopics.push(`hub/${device.type}/${device.id}/state`);
        neededTopics.push(`hub/${device.type}/${device.id}/logs`);
      }

      ws.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;

            setTimeout(() => {
              devices[0].call('change');
              devices[1].call('change');
              devices[2].call('change');
              devices[3].call('change');
            }, 50);
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert.equal(json.subscriptionId, subscriptionId);
            assert(json.data);
            const idx = neededTopics.indexOf(json.topic);
            assert.notEqual(idx, -1);
            neededTopics.splice(idx, 1);
            if (neededTopics.length === 0) {
              done();
            }
          }
        });
      });
      ws.on('error', done);
    });

    itBoth('wildcard topic for single peer receives all messages for all topics', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let subscriptionId = null;
      let count = 0;
      const topic = 'hub/testdriver/*/state';
      let lastTopic = null;
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;

            setTimeout(() => {
              devices[0].call('change');
              devices[1].call('change');
            }, 50);
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert.notEqual(json.topic, lastTopic);
            lastTopic = json.topic;
            assert.equal(json.subscriptionId, subscriptionId);
            assert(json.data);
            count++;
            if(count === 2) {
              done();
            }
          }
        });
      });
      ws.on('error', done);  
    });
    
    itBoth('wildcard topic for device id and stream types receives all messages for all topics', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let subscriptionId = null;
      let count = 0;
      const topic = 'hub/testdriver/**';
      let lastTopic = null;
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;

            setTimeout(() => {
              devices[0].call('change');
              devices[1].call('change');
            }, 50);
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert.notEqual(json.topic, lastTopic);
            lastTopic = json.topic;
            assert.equal(json.subscriptionId, subscriptionId);
            assert(json.data);
            count++;
            if(count === 4) {
              done();
            }
          }
        });
      });
      ws.on('error', done);  
    });

    itBoth('**/led/<device_id>/state will match valid topic', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let subscriptionId = null;
      const topic = validTopics[0].replace('hub/', '**/');
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;

            setTimeout(() => {
              devices[1].call('change');
              devices[0].call('change');
            }, 50);
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert.equal(json.topic, validTopics[0]);
            assert.equal(json.subscriptionId, subscriptionId);
            assert(json.data);
            done();
          }
        });
      });
      ws.on('error', done);  
    });

    itBoth('**/<device_id>/state will match valid topic from device', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let subscriptionId = null;
      const topic = validTopics[0].replace('hub/', '**/');
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;

            setTimeout(() => {
              devices[1].call('change');
              devices[0].call('change');
            }, 50);
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert.equal(json.topic, validTopics[0]);
            assert.equal(json.subscriptionId, subscriptionId);
            assert(json.data);
            done();
          }
        });
      });
      ws.on('error', done);  
    });

    itBoth('**/state will match valid topic from device', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let subscriptionId = null;
      const topic = validTopics[0].replace('hub/', '**/');
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;

            setTimeout(() => {
              devices[0].call('change');
            }, 50);
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert.equal(json.topic, validTopics[0]);
            assert.equal(json.subscriptionId, subscriptionId);
            assert(json.data);
            done();
          }
        });
      });
      ws.on('error', done);  
    });


    itBoth('subscribing to logs topic on device will get properly formated response', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let subscriptionId = null;
      const topic = 'hub/testdriver/*/logs';
      let lastTopic = null;
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;
            setTimeout(() => {
              devices[0].call('change');
            }, 50);
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert.notEqual(json.topic, lastTopic);
            lastTopic = json.topic;
            assert.equal(json.subscriptionId, subscriptionId);
            assert(json.data);
            assert.equal(json.data.transition, 'change');
            assert(!json.data.transitions);
            assert.deepEqual(json.data.input, []);
            assert(json.data.properties);
            assert(json.data.actions);
            done();
          }
        });
      });
      ws.on('error', done);  
    });


    itBoth('topic that doesnt exist still opens stream', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      const topic = 'blah/foo/1/blah';
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          assert.equal(json.type, 'subscribe-ack');
          assert(json.timestamp);
          assert.equal(json.topic, topic);
          assert(json.subscriptionId);
          done();
        });
      });
      ws.on('error', done);
    });

    it('subscription cloud will get _peer/connect events from hub', done => {
      const endpoint = urls[0];
      const topic = 'hub/**';
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'subscribe', topic }));
        
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if (json.type === 'subscribe-ack') {
            const z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
            z.name('some-peer');
            z.link(`http://${urls[1]}`); // link to hub
            z.silent();
            z.listen(0);
          } else if (json.type === 'event'){
            assert.equal(json.topic, 'hub/_peer/connect');
            assert.equal(json.data.id, 'some-peer');
            done();
          }
        });

      });
    });

    itBoth('subscription to non existent hub does not return data for that subscriptionId', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);   
      const validTopic = validTopics[0];
      const invalidTopic = validTopic.replace('hub/', 'notahub/');
      let invalidSubscriptionId = null;

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'subscribe', topic: invalidTopic }));
        ws.send(JSON.stringify({ type: 'subscribe', topic: validTopic }));

        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if (json.type === 'subscribe-ack') {
            if (json.topic === invalidTopic) {
              invalidSubscriptionId = json.subscriptionId;
            }
            setTimeout(() => {
              devices[0].call('change');
            }, 50)
          } else {
            assert.notEqual(json.subscriptionId, invalidSubscriptionId);
            done();
          }
        });
      });
      ws.on('error', done);
    });

    itBoth('wildcard and specific topic will each publish a message on a subscription', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let subscriptionId = null;
      let count = 0;
      let ackCount = 0;
      const topicOne = validTopics[0];
      const topicTwo = 'hub/testdriver/*/state';
      ws.on('open', () => {
        const msgOne = { type: 'subscribe', topic: topicOne };
        const msgTwo = { type: 'subscribe', topic: topicTwo };
        ws.send(JSON.stringify(msgOne));
        ws.send(JSON.stringify(msgTwo));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;
            ackCount++;
            setTimeout(() => {
              for(let i=0; i<11; i++) {
                devices[0].call((i % 2 === 0) ? 'change' : 'prepare');
              }
            }, 50);
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId);
            count++;
            if(count === 2) {
              assert.equal(ackCount, 2);
              done();
            }
          }
        });
      });
      ws.on('error', done);     
    });

    itBoth('adding limit to subscription should limit number of messages received', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let subscriptionId = null;
      let count = 0;
      const topic = validTopics[0];
      const data = null;
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic, limit: 10 };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;

            setTimeout(() => {
              for(let i=0; i<15; i++) {
                devices[0].call((i % 2 === 0) ? 'change' : 'prepare');
              }
            }, 50);
          } else if (json.type !== 'unsubscribe-ack') {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId, subscriptionId);
            assert(json.data);

            count++;
            if(count === 10) {
              setTimeout(() => {
                assert.equal(count, 10);
                done();
              }, 200)
            }
          }
        });
      });
      ws.on('error', done);  
    });

    itBoth('when limit is reached a unsubscribe-ack should be received', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let subscriptionId = null;
      let count = 0;
      const topic = validTopics[0];
      const data = null;
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic, limit: 10 };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;
            setTimeout(() => {
              for(let i=0; i<11; i++) {
                devices[0].call((i % 2 === 0) ? 'change' : 'prepare');
              }
            }, 50);
          } else if(json.type === 'event') {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId, subscriptionId);
            assert(json.data);
            count++;
          } else if(json.type === 'unsubscribe-ack') {
            assert.equal(json.type, 'unsubscribe-ack');
            assert(json.timestamp);
            assert.equal(json.subscriptionId, subscriptionId);
            assert.equal(count, 10);
            done();
          }
        });
      });
      ws.on('error', done);  
    });

    itBoth('when limit is reached with a query selector a unsubscribe-ack should be received', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let subscriptionId = null;
      let count = 0;
      const topic = `hub/testdriver/${devices[0].id}/bar?select data where data >= 5`;
      const data = null;
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic, limit: 10 };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;
            setTimeout(() => {
              for(let i=0; i<16; i++) {
                devices[0].incrementStreamValue();
              }
            }, 50);
          } else if(json.type === 'event') {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId, subscriptionId);
            assert(json.data);
            count++;
          } else if(json.type === 'unsubscribe-ack') {
            assert.equal(json.type, 'unsubscribe-ack');
            assert(json.timestamp);
            assert.equal(json.subscriptionId, subscriptionId);
            assert.equal(count, 10);
            done();
          }
        });
      });
      ws.on('error', done);  
    });

    itBoth('query field selector should only return properties in selection', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let subscriptionId = null;
      const count = 0;
      const topic = `hub/testdriver/${devices[0].id}/bar?select data where data >= 1`;
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;
            setTimeout(() => {
              devices[0].incrementStreamValue();
            }, 50);
          } else if(json.type === 'event') {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId, subscriptionId);
            assert(json.data);
            done();
          }
        });
      });
      ws.on('error', done);  
    });

    itBoth('query field selector * should all properties in selection', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let subscriptionId = null;
      const count = 0;
      const topic = `hub/testdriver/${devices[0].id}/fooobject?select * where data.val >= 2`;
      const data = { foo: 'bar', val: 2 };
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;
            setTimeout(() => {
              devices[0].publishStreamObject(data);
            }, 50);
          } else if(json.type === 'event') {
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId, subscriptionId);
            assert(json.data);
            assert.equal(json.data.val, 2);
            assert.equal(json.data.foo, 'bar');
            done();
          }
        });
      });
      ws.on('error', done);  
    });

    itBoth('query field selector should return only selected properties', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let subscriptionId = null;
      const count = 0;
      const topic = `hub/testdriver/${devices[0].id}/fooobject?select data.val`;
      const data = { foo: 'bar', val: 2 };
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;
            setTimeout(() => {
              devices[0].publishStreamObject(data);
            }, 50);
          } else if(json.type === 'event') {
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId, subscriptionId);
            assert(json.data);
            assert.equal(json.data.val, 2);
            assert.equal(json.data.foo, undefined);
            done();
          }
        });
      });
      ws.on('error', done);  
    });

    itBoth('subscribing to all ** and then unsubscribing followed by a peer connecting wont crash zetta', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      const topic = '**';
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert(json.topic);
            assert(json.subscriptionId);
            const msg = { type: 'unsubscribe', subscriptionId: json.subscriptionId };
            ws.send(JSON.stringify(msg));
          } else if(json.type === 'unsubscribe-ack') {
            const z = zetta({ registry: new MemRegistry(), peerRegistry: new MemPeerRegistry() });
            z.silent();
            z.name('some-new-peer')
            z.link(`http://${urls[0]}`);
            z.use(server => {
              server.pubsub.subscribe('_peer/connect', (topic, data) => {
                setTimeout(() => {
                  done();
                }, 400);
              });
            });
            z.listen(0);
          }
        });
      });
      ws.on('error', done);  
    });

    itBoth('Passing filterMultiple options to ws only one data event will be sent', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}?filterMultiple=true`);
      const topic = validTopics[0];
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic };
        const msg2 = { type: 'subscribe', topic: 'hub/testdriver/*/state' };
        ws.send(JSON.stringify(msg));
        ws.send(JSON.stringify(msg2));
        const subscriptions = [];
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert(json.subscriptionId);
            subscriptions.push(json.subscriptionId);
            if (subscriptions.length === 2) {
              setTimeout(() => {
                devices[0].call('change');
              }, 50);
            }
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert.equal(json.subscriptionId.length, subscriptions.length);
            subscriptions.forEach(id => {
              assert(json.subscriptionId.indexOf(id) >= -1);
            });
            assert(json.data);
            done();
          }
        });
      });
      ws.on('error', done);
    });

    itBoth('Passing filterMultiple options to ws will apply limits for both topics', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}?filterMultiple=true`);
      const topic = validTopics[0];
      const topic2 = 'hub/testdriver/*/state';
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic, limit: 2 };
        const msg2 = { type: 'subscribe', topic: topic2, limit: 3 };
        ws.send(JSON.stringify(msg));
        ws.send(JSON.stringify(msg2));
        const subscriptions = {};
        
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert(json.subscriptionId);
            subscriptions[json.subscriptionId] = 0;
            if (Object.keys(subscriptions).length === 2) {
              setTimeout(() => {
                devices[0].call('change');
                devices[0].call('prepare');
                devices[0].call('change');
              }, 50);
            }
          } else if (json.type === 'event') {
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.data);

            json.subscriptionId.forEach(id => {
              subscriptions[id]++;
            });

            if (subscriptions[1] === 2 && subscriptions[2] === 3) {
              done();
            }
          }
        });
      });
      ws.on('error', done);
    });

    itBoth('Passing filterMultiple options to ws will have no effect on topics with caql query', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}?filterMultiple=true`);
      const topic = `${validTopics[0]}?select *`;
      const topic2 = 'hub/testdriver/*/state';
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic };
        const msg2 = { type: 'subscribe', topic: topic2 };
        ws.send(JSON.stringify(msg));
        ws.send(JSON.stringify(msg2));
        let received = 0;
        
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert(json.subscriptionId);
            setTimeout(() => {
              devices[0].call('change');
            }, 50);
          } else if (json.type === 'event') {
            assert(json.timestamp);
            assert(json.data);
            assert.equal(json.subscriptionId.length, 1);
            received++;

            if (received === 2) {
              done();
            }
          }
        });
      });
      ws.on('error', done);
    });

      
    itBoth('subscribing to a query with hub for hub will return all devices', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let subscriptionId = null;
      const topic = 'hub/query/where type is not missing';
      let count = 0;
      const expected = (idx === 1) ? 2 : 2;
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert.equal(json.subscriptionId, subscriptionId);
            assert(json.data);
            count++;
            if (count === expected) {
              done();
            }
          }
        });
      });
      ws.on('error', done);
    });


    itBoth('subscribing to a query with * for hub will return all devices', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let subscriptionId = null;
      const topic = '*/query/where type is not missing';
      let count = 0;
      const expected = (idx === 1) ? 2 : 4; // cloud will have 4 devices
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert.equal(json.subscriptionId, subscriptionId);
            assert(json.data);
            count++;
            if (count === expected) {
              done();
            }
          }
        });
      });
      ws.on('error', done);
    });

    itBoth('when data is 0 value it should be formatted correctly', (idx, done) => {
      const endpoint = urls[idx];
      const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
      let subscriptionId = null;
      const topic = `hub/testdriver/${devices[0].id}/bar`;
      ws.on('open', () => {
        const msg = { type: 'subscribe', topic };
        ws.send(JSON.stringify(msg));
        ws.on('message', buffer => {
          const json = JSON.parse(buffer);
          if(json.type === 'subscribe-ack') {
            assert.equal(json.type, 'subscribe-ack');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert(json.subscriptionId);
            subscriptionId = json.subscriptionId;

            setTimeout(() => {
              devices[0].bar = -1;
              devices[0].incrementStreamValue();
            }, 50);
          } else {
            assert.equal(json.type, 'event');
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert.equal(json.subscriptionId, subscriptionId);
            assert.equal(json.data, 0);
            done();
          }
        });
      });
      ws.on('error', done);
    });
    
    describe('Protocol Errors', () => {

      const makeTopicStringErrorsTest = topic => {
        itBoth(`invalid stream topic "${topic}" should result in a 400 error`, (idx, done) => {
          const endpoint = urls[idx];
          const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
          ws.on('open', () => {
            const msg = { type: 'subscribe', topic };
            ws.send(JSON.stringify(msg));
            ws.on('message', buffer => {
              const json = JSON.parse(buffer);
              assert(json.timestamp);
              assert.equal(json.topic, topic);
              assert.equal(json.code, 400);
              assert(json.message);
              done();
            });
          });
          ws.on('error', done);  
        });
      };

      makeTopicStringErrorsTest('*');
      makeTopicStringErrorsTest('hub');
      makeTopicStringErrorsTest('{hub.+}');
      makeTopicStringErrorsTest('*/');
      makeTopicStringErrorsTest('**/');
      makeTopicStringErrorsTest('hub/');
      makeTopicStringErrorsTest('{hub.+}/');

      itBoth('invalid stream query should result in a 400 error', (idx, done) => {
        const endpoint = urls[idx];
        const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
        const subscriptionId = null;
        const count = 0;
        const topic = `hub/testdriver/${devices[0].id}/fooobject?invalid stream query`;
        const data = { foo: 'bar', val: 2 };
        ws.on('open', () => {
          const msg = { type: 'subscribe', topic };
          ws.send(JSON.stringify(msg));
          ws.on('message', buffer => {
            const json = JSON.parse(buffer);
            assert(json.timestamp);
            assert.equal(json.topic, topic);
            assert.equal(json.code, 400);
            assert(json.message);
            done();
          });
        });
        ws.on('error', done);  
      });

      itBoth('invalid subscribe should result in a 400 error', (idx, done) => {
        const endpoint = urls[idx];
        const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
        const subscriptionId = null;
        const count = 0;
        const topic = `hub/testdriver/${devices[0].id}/fooobject`;
        ws.on('open', () => {
          const msg = { type: 'subscribe' };
          ws.send(JSON.stringify(msg));
          ws.on('message', buffer => {
            const json = JSON.parse(buffer);
            assert(json.timestamp);
            assert.equal(json.code, 400);
            assert(json.message);
            done();
          });
        });
        ws.on('error', done);  
      });

      itBoth('unsubscribing from an invalid subscriptionId should result in a 405 error', (idx, done) => {
        const endpoint = urls[idx];
        const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
        const subscriptionId = null;
        const count = 0;
        ws.on('open', () => {
          const msg = { type: 'unsubscribe', subscriptionId: 123 };
          ws.send(JSON.stringify(msg));
          ws.on('message', buffer => {
            const json = JSON.parse(buffer);
            assert(json.timestamp);
            assert.equal(json.code, 405);
            assert(json.message);
            done();
          });
        });
        ws.on('error', done);  
      });

      itBoth('invalid type should result in a 405 error', (idx, done) => {
        const endpoint = urls[idx];
        const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
        const subscriptionId = null;
        const count = 0;
        ws.on('open', () => {
          const msg = { type: 'not-a-type', topic: '**' };
          ws.send(JSON.stringify(msg));
          ws.on('message', buffer => {
            const json = JSON.parse(buffer);
            assert(json.timestamp);
            assert.equal(json.code, 405);
            assert(json.message);
            done();
          });
        });
        ws.on('error', done);  
      });

      itBoth('unsubscribing from a missing subscriptionId should result in a 400 error', (idx, done) => {
        const endpoint = urls[idx];
        const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
        const subscriptionId = null;
        const count = 0;
        ws.on('open', () => {
          const msg = { type: 'unsubscribe' };
          ws.send(JSON.stringify(msg));
          ws.on('message', buffer => {
            const json = JSON.parse(buffer);
            assert(json.timestamp);
            assert.equal(json.code, 400);
            assert(json.message);
            done();
          });
        });
        ws.on('error', done);  
      });

      itBoth('on invalid message should result in a 400 error', (idx, done) => {
        const endpoint = urls[idx];
        const ws = new WebSocket(`ws://${endpoint}${baseUrl}`);
        const subscriptionId = null;
        const count = 0;
        ws.on('open', () => {
          const msg = { test: 123 };
          ws.send(JSON.stringify(msg));
          ws.on('message', buffer => {
            const json = JSON.parse(buffer);
            assert(json.timestamp);
            assert.equal(json.code, 400);
            assert(json.message);
            done();
          });
        });
        ws.on('error', done);  
      });


    })

  });

  describe('SPDY API', () => {
  });

});
