const assert = require('assert');
const request = require('supertest');
const zetta = require('../');
const rels = require('zetta-rels');
const Scout = require('./fixture/example_scout');
const Driver = require('./fixture/example_driver');
const Registry = require('./fixture/mem_registry');
const PeerRegistry = require('./fixture/mem_peer_registry');

function getHttpServer(app) {
  return app.httpServer.server;
}

function getBody(fn) {
  return res => {
    try {
      if(res.text) {
        var body = JSON.parse(res.text);
      } else {
        var body = '';
      }
    } catch(err) {
      throw new Error('Failed to parse json body');
    }

    fn(res, body);
  };
}

describe('Metadata API', () => {
  let reg = null;
  let peerRegistry = null;
  let app = null;
  let url = null;
  let device = null;

  beforeEach(done => {
    reg = new Registry();
    peerRegistry = new PeerRegistry();

    app = zetta({ registry: reg, peerRegistry })
      .silent()
      .use(Driver)
      .name('local')
      ._run(() => {
        device = app.runtime._jsDevices[Object.keys(app.runtime._jsDevices)[0]];
        url = `/servers/${app._name}/devices/${device.id}`;
        done();
      });
  });

  it('should contain a metadata class', done => {
      request(getHttpServer(app))
        .get('/servers/local/meta')
        .expect(getBody((res, body) => {
          assert.deepEqual(body.class, ['metadata']);
        }))
        .end(done);
  });

  it('should contain a self link', done => {
      request(getHttpServer(app))
        .get('/servers/local/meta')
        .expect(getBody((res, body) => {
          assert.equal(body.links[0].rel[0], 'self');
        }))
        .end(done);
  });

  it('should contain a server link', done => {
      request(getHttpServer(app))
        .get('/servers/local/meta')
        .expect(getBody((res, body) => {
          assert.equal(body.links[1].rel[0], rels.server);
        }))
        .end(done);
  });

  it('should contain a monitor link', done => {
      request(getHttpServer(app))
        .get('/servers/local/meta')
        .expect(getBody((res, body) => {
          assert.equal(body.links[2].rel[0], 'monitor');
          assert.notEqual(body.links[2].href.indexOf('topic=meta'), -1);
        }))
        .end(done);
  });

  describe('Type Sub-entity', () => {
    it('should contain a type class', done => {
        request(getHttpServer(app))
          .get('/servers/local/meta')
          .expect(getBody((res, body) => {
            assert.deepEqual(body.entities[0].class, ['type']);
          }))
          .end(done);
    });

    it('should contain properties', done => {
        request(getHttpServer(app))
          .get('/servers/local/meta')
          .expect(getBody((res, body) => {
            assert(Object.keys(body.entities[0].properties.properties).length > 0);
          }))
          .end(done);
    });

    it('should contain streams', done => {
        request(getHttpServer(app))
          .get('/servers/local/meta')
          .expect(getBody((res, body) => {
            assert(body.entities[0].properties.streams.length > 0);
          }))
          .end(done);
    });

    it('should contain transitions', done => {
        request(getHttpServer(app))
          .get('/servers/local/meta')
          .expect(getBody((res, body) => {
            assert(body.entities[0].properties.transitions.length > 0);
          }))
          .end(done);
    });

    it('should contain a self link', done => {
        request(getHttpServer(app))
          .get('/servers/local/meta')
          .expect(getBody((res, body) => {
            assert.equal(body.entities[0].links[0].rel[0], 'self');
          }))
          .end(done);
    });
  });

  describe('Type Sub-resource', () => {
    it('should contain a type class', done => {
        request(getHttpServer(app))
          .get('/servers/local/meta/testdriver')
          .expect(getBody((res, body) => {
            assert.deepEqual(body.class, ['type']);
          }))
          .end(done);
    });

    it('should contain properties', done => {
        request(getHttpServer(app))
          .get('/servers/local/meta/testdriver')
          .expect(getBody((res, body) => {
            assert(Object.keys(body.properties.properties).length > 0);
          }))
          .end(done);
    });

    it('should contain streams', done => {
        request(getHttpServer(app))
          .get('/servers/local/meta/testdriver')
          .expect(getBody((res, body) => {
            assert(body.properties.streams.length > 0);
          }))
          .end(done);
    });

    it('should contain transitions', done => {
        request(getHttpServer(app))
          .get('/servers/local/meta/testdriver')
          .expect(getBody((res, body) => {
            assert(body.properties.transitions.length > 0);
          }))
          .end(done);
    });

    it('should contain a self link', done => {
        request(getHttpServer(app))
          .get('/servers/local/meta/testdriver')
          .expect(getBody((res, body) => {
            assert.equal(body.links[0].rel[0], 'self');
          }))
          .end(done);
    });

    it('should contain a collection link', done => {
        request(getHttpServer(app))
          .get('/servers/local/meta/testdriver')
          .expect(getBody((res, body) => {
            assert.equal(body.links[1].rel[0], 'collection');
            assert.equal(body.links[1].rel[1], rels.metadata);
          }))
          .end(done);
    });

    it('should contain an instances link', done => {
        request(getHttpServer(app))
          .get('/servers/local/meta/testdriver')
          .expect(getBody((res, body) => {
            assert.equal(body.links[2].rel[0], rels.instances);
            assert.equal(body.links[2].rel[1], 'describes');
          }))
          .end(done);
    });
  });
});
