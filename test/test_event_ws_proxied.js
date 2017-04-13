const zetta = require('../');
const assert = require('assert');
const http = require('http');
const WebSocket = require('ws');
const Scout = require('./fixture/example_scout');
const zettacluster = require('zetta-cluster');

describe('Event Websocket Proxied Through Peer', () => {
  let base = null;
  let cluster = null;
  let device = null;

  beforeEach(done => {
    cluster = zettacluster({ zetta: zetta })
      .server('cloud deploy')
      .server('detroit 1', [Scout], ['cloud deploy'])
      .on('ready', () => {
        const id = cluster.servers['detroit 1'].id;
        base = `localhost:${cluster.servers['cloud deploy']._testPort}/servers/${cluster.servers['cloud deploy'].locatePeer(id)}`;
        const did = Object.keys(cluster.servers['detroit 1'].runtime._jsDevices)[0];
        device = cluster.servers['detroit 1'].runtime._jsDevices[did];
        setTimeout(done, 300);
      })
      .run(err => {
        if (err) {
          done(err);
        }
      });
  });

  afterEach(done => {
    cluster.stop();
    setTimeout(done, 10); // fix issues with server not being closed before a new one starts
  });

  describe('Basic Connection', () => {

    it('http resource should exist with statusCode 200', done => {
      http.get(`http://${base}/devices/${device.id}`, res => {
        assert.equal(res.statusCode, 200);
        done();
      }).on('error', done);
    });

    it('websocket should connect', done => {
      const url = `ws://${base}/events?topic=testdriver/${device.id}/bar`;
      const socket = new WebSocket(url);
      socket.on('open', done);
    });
  });



  describe('Receive json messages', () => {

    it('websocket should connect and recv data in json form', done => {
      const url = `ws://${base}/events?topic=testdriver/${device.id}/bar`;
      const socket = new WebSocket(url);
      socket.on('open', err => {
        let recv = 0;
        socket.on('message', (buf, flags) => {
          const msg = JSON.parse(buf);
          recv++;
          assert(msg.timestamp);
          assert(msg.topic);
          assert.equal(msg.data, recv);
          if (recv === 3) {
            done();
          }
        });

        setTimeout(() => {
          device.incrementStreamValue();
          device.incrementStreamValue();
          device.incrementStreamValue();
        }, 100);
      });
    });

    it('websocket should recv only one set of messages when reconnecting', done => {
      const url = `ws://${base}/events?topic=testdriver/${device.id}/bar`;

      function openAndClose(cb) {
        const s1 = new WebSocket(url);
        s1.on('open', err => {
          s1.close();
          s1.on('close', () => {
            cb();
          });
        });
      }
      openAndClose(() => {
        const s2 = new WebSocket(url);
        s2.on('open', err => {
          let count = 0;
          s2.on('message', (buf, flags) => {
            count++;
          });

          setTimeout(() => {
            device.incrementStreamValue();

            setTimeout(() => {
              assert.equal(count, 1, `Should have only received 1 message. Received: ${count}`);
              done();
            }, 500);
          }, 100);
        });
      });

      return;
    });


    it('websocket should connect and recv device log events', done => {
      const url = `ws://${base}/events?topic=testdriver/${device.id}/logs`;
      const socket = new WebSocket(url);
      socket.on('open', err => {
        socket.on('message', (buf, flags) => {
          const msg = JSON.parse(buf);
          assert(msg.timestamp);
          assert(msg.topic);
          assert(msg.actions.filter(action => action.name === 'prepare').length > 0);
          
          assert.equal(msg.actions[0].href.replace('http://',''), `${base}/devices/${device.id}`)
          done();
        });
        
        setTimeout(() => {
          device.call('change');
        }, 100);
      });        
    });

  });






  describe('Receive binary messages', () => {

    it('websocket should connect and recv data in binary form', done => {
      const url = `ws://${base}/events?topic=testdriver/${device.id}/foobar`;
      const socket = new WebSocket(url);
      socket.on('open', err => {
        let recv = 0;
        socket.on('message', (buf, flags) => {
          assert(Buffer.isBuffer(buf));
          assert(flags.binary);
          recv++;
          assert.equal(buf[0], recv);
          if (recv === 3) {
            done();
          }
        });

        setTimeout(() => {
          device.incrementFooBar();
          device.incrementFooBar();
          device.incrementFooBar();
        }, 100);
      });
    });

  });



});
