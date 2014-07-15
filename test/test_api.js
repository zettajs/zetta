var assert = require('assert');
var os = require('os');
var request = require('supertest');
var zetta = require('../zetta');

var PeerRegistry = require('./fixture/scout_test_mocks').MockPeerRegistry;
var Registry = require('./fixture/scout_test_mocks').MockRegistry;
var rels = require('../lib/api_rels');
var Scout = require('./fixture/example_scout');

function getHttpServer(app) {
  return app.httpServer.server;
}

function getBody(fn) {
  return function(res) {
    try {
      var body = JSON.parse(res.text);
    } catch(err) {
      throw new Error('Failed to parse json body');
    }

    fn(res, body);
  }
}

function checkDeviceOnRootUri(entity) {
  assert.deepEqual(entity.class, ['device']);
  assert(entity.properties.id);
  assert(entity.properties.name);
  assert(entity.properties.type);
  assert(entity.properties.state);
  assert(!entity.actions); // should not have actions on it

  assert(entity.links);
  hasLinkRel(entity.links, rels.self);
  hasLinkRel(entity.links, rels.server);
}

function hasLinkRel(links, rel, title, href) {
  var found = false;

  links.forEach(function(link) {
    if(link.rel.indexOf(rel) != -1) {
      found = true;

      if(title !== undefined && link.title !== title) {
        throw new Error('link title does not match');
      }

      if(href !== undefined && link.href !== href) {
        throw new Error('link href does not match');
      }
    }
  });

  if(!found) {
    throw new Error('Link rel:'+rel+' not found in links');
  }
}


describe('Zetta Api', function() {
  var reg = null;
  var peerRegistry = null;

  beforeEach(function() {
    reg = new Registry();
    peerRegistry = new PeerRegistry();
  });


  describe('/servers/<peer id> ', function() {
    var app = null;
    var url = null;

    beforeEach(function(done) {
      app = zetta({ registry: reg, peerRegistry: peerRegistry })
        .use(Scout)
        .name('local')
        .expose('*')
        ._run(done);

      url = '/servers/'+app.id;
    });

    it('should have content type application/vnd.siren+json', function(done) {
      request(getHttpServer(app))
        .get(url)
        .expect('Content-Type', 'application/vnd.siren+json', done);
    });

    it('should return status code 200', function(done) {
      request(getHttpServer(app))
        .get(url)
        .expect(200, done);
    });

    it('should have class ["server"]', function(done) {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody(function(res, body) {
          assert.deepEqual(body.class, ['server']);
        }))
        .end(done);
    });

    it('should have proper name and id property', function(done) {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody(function(res, body) {
          assert.equal(body.properties.id, app.id);
          assert.equal(body.properties.name, 'local');
        }))
        .end(done);
    });

    it('should have self link and log link', function(done) {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody(function(res, body) {
          assert(body.links);
          hasLinkRel(body.links, 'self');
          hasLinkRel(body.links, 'monitor');
        }))
        .end(done);
    });

    it('should have valid entities', function(done) {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody(function(res, body) {
          assert(body.entities);
          assert.equal(body.entities.length, 1);
          checkDeviceOnRootUri(body.entities[0]);
        }))
        .end(done);
    });
  });

  describe('/', function() {
    var app = null;

    beforeEach(function() {
      app = zetta({ registry: reg, peerRegistry: peerRegistry })
        .use(Scout)
        .name('local')
        .expose('*')
        ._run();
    });

    it('should have content type application/vnd.siren+json', function(done) {
      request(getHttpServer(app))
        .get('/')
        .expect('Content-Type', 'application/vnd.siren+json', done);
    });

    it('should have status code 200', function(done) {
      request(getHttpServer(app))
        .get('/')
        .expect(200, done);
    });

    it('body should contain class ["root"]', function(done) {
      request(getHttpServer(app))
        .get('/')
        .expect(getBody(function(res, body) {
          assert.deepEqual(body.class, ['root']);
      }))
      .end(done)
    });


    it('body should contain links property', function(done) {
      request(getHttpServer(app))
        .get('/')
        .expect(getBody(function(res, body) {
          assert.equal(body.links.length, 3);
          hasLinkRel(body.links, 'self');
        }))
        .end(done)
    });

    it('links should contain rel to server', function(done) {
      request(getHttpServer(app))
        .get('/')
        .expect(getBody(function(res, body) {
          hasLinkRel(body.links, rels.server);
        }))
        .end(done)
    });

    it('should use a default server name if none has been provided', function(done) {
      var app = zetta({ registry: reg, peerRegistry: peerRegistry })._run();

      request(getHttpServer(app))
        .get('/')
        .expect(getBody(function(res, body) {
          var self = body.links.filter(function(link) {
            return link.rel.indexOf(rels.server) !== -1;
          })[0];

          assert.equal(self.title, os.hostname());
        }))
        .end(done);
    });
  });

  describe('/peer-management', function() {
    var app = null;

    before(function(done) {
      peerRegistry.save({
        id: '12341234',
        name: 'test-peer'
      }, done);
    });

    beforeEach(function(done) {
      app = zetta({ registry: reg, peerRegistry: peerRegistry })
        .use(Scout)
        .name('local')
        .expose('*')
        ._run(done);
    });

    it('should have content type application/vnd.siren+json', function(done) {
      request(getHttpServer(app))
        .get('/peer-management')
        .expect('Content-Type', 'application/vnd.siren+json', done);
    });

    it('should return status code 200', function(done) {
      request(getHttpServer(app))
        .get('/peer-management')
        .expect(200, done);
    });

    it('should have class ["peer-management"]', function(done) {
      request(getHttpServer(app))
        .get('/peer-management')
        .expect(getBody(function(err, body) {
          assert.deepEqual(body.class, ['peer-management']);
        }))
        .end(done);
    });

    it('should list saved peers', function(done) {
      peerRegistry.save({ id: '0' }, function() {
        request(getHttpServer(app))
          .get('/peer-management')
          .expect(getBody(function(err, body) {
            assert.equal(body.entities.length, 1);
          }))
          .end(done);
      });
    });
  });

  describe('/devices of server', function() {
    var app = null;

    beforeEach(function(done) {
      app = zetta({ registry: reg, peerRegistry: peerRegistry })
        .use(Scout)
        .name('local')
        .expose('*')
        ._run(done);
    });

    it('should have content type application/vnd.siren+json', function(done) {
      request(getHttpServer(app))
        .get('/devices')
        .expect('Content-Type', 'application/vnd.siren+json', done);
    });

    it('should return status code 200', function(done) {
      request(getHttpServer(app))
        .get('/devices')
        .expect(200, done);
    });

    it('should have class ["devices"]', function(done) {
      request(getHttpServer(app))
        .get('/devices')
        .expect(getBody(function(res, body) {
          assert.deepEqual(body.class, ['devices']);
        }))
        .end(done);
    });

    it('should have one valid entity', function(done) {
      request(getHttpServer(app))
        .get('/devices')
        .expect(getBody(function(res, body) {
          assert(body.entities);
          assert.equal(body.entities.length, 1);
          checkDeviceOnRootUri(body.entities[0]);
          hasLinkRel(body.links, 'self');
        }))
        .end(done);
    });
  });




  describe('/servers/:id/devices/:id', function() {
    var app = null;
    var url = null;
    var device = null;

    beforeEach(function(done) {
      app = zetta({ registry: reg, peerRegistry: peerRegistry })
        .use(Scout)
        .name('local')
        .expose('*')
        ._run(function() {
          device = app.runtime._jsDevices[Object.keys(app.runtime._jsDevices)[0]];
          url = '/servers/' + app.id + '/devices/' + device.id;
          done();
        });
    });

    it('should have content type application/vnd.siren+json', function(done) {
      request(getHttpServer(app))
        .get(url)
        .expect('Content-Type', 'application/vnd.siren+json', done);
    });

    it('class should be ["device"]', function(done) {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody(function(res, body) {
          assert.deepEqual(body.class, ['device']);
        }))
        .end(done);
    });

    /*
          checkDeviceOnRootUri(body.entities[0]);
          hasLinkRel(body.links, 'self');

     */

    it('properties should match expected', function(done) {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody(function(res, body) {
          assert(body.properties);
          assert.equal(body.properties.name, device.properties.name);
          assert.equal(body.properties.type, device.properties.type);
          assert.equal(body.properties.id, device.properties.id);
          assert.equal(body.properties.state, device.properties.state);
        }))
        .end(done);
    });

    it('device should have action change', function(done) {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody(function(res, body) {
          assert.equal(body.actions.length, 1);
          var action = body.actions[0];
          assert.equal(action.name, 'change');
          assert.equal(action.method, 'POST');
          assert(action.href);
          assert.deepEqual(action.fields[0], { name: 'action', type: 'hidden', value: 'change' });
        }))
        .end(done);
    });

    it('device should have self link', function(done) {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody(function(res, body) {
          hasLinkRel(body.links, 'self');
        }))
        .end(done);
    });

    it('device should have up link to server', function(done) {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody(function(res, body) {
          hasLinkRel(body.links, 'up');
        }))
        .end(done);
    });

    it('device should have monitor link for bar', function(done) {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody(function(res, body) {
          hasLinkRel(body.links, 'monitor');
        }))
        .end(done);
    });
 });


});
