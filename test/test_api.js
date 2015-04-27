var assert = require('assert');
var os = require('os');
var request = require('supertest');
var zetta = require('../zetta');
var Query = require('calypso').Query;
var rels = require('zetta-rels');
var Scout = require('./fixture/example_scout');
var Driver = require('./fixture/example_driver');
var HttpDriver = require('./fixture/example_http_driver');
var Registry = require('./fixture/mem_registry');
var PeerRegistry = require('./fixture/mem_peer_registry');

function getHttpServer(app) {
  return app.httpServer.server;
}

function getBody(fn) {
  return function(res) {
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
  }
}

function checkDeviceOnRootUri(entity) {
  assert(entity.class.indexOf('device') >= 0);
  assert(entity.class.indexOf(entity.properties.type) >= 0);
  assert.deepEqual(entity.rel, ["http://rels.zettajs.io/device"]);
  
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
        .silent()
        .use(Scout)
        .use(HttpDriver)
        .name('local')
        .expose('*')
        ._run(done);

      url = '/servers/'+app._name;
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

    it('should have monitor log link formatted correctly', function(done) {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody(function(res, body) {          
          var link = body.links.filter(function(l) {
            return l.rel.indexOf('monitor') > -1;
          })[0];
          var obj = require('url').parse(link.href, true);
          assert(obj.query.topic);
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

    it('should have two actions', function(done) {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody(function(res, body) {
          assert(body.actions);
          assert.equal(body.actions.length,2);
        }))
        .end(done);
    });

    it('should accept remote devices of type testdriver', function(done) {
      request(getHttpServer(app))
        .post(url + '/devices')
        .send('type=testdriver')
        .end(function(err, res) {
          getBody(function(res, body) {
            assert.equal(res.statusCode, 201);
            var query = Query.of('devices');
            reg.find(query, function(err, machines) {
              assert.equal(machines.length, 2);
              assert.equal(machines[1].type, 'testdriver');
              done();
            });
          })(res);
        });
    });

    it('should not accept a remote device of type foo', function(done) {
      request(getHttpServer(app))
        .post(url + '/devices')
        .send('type=foo')
        .expect(getBody(function(res, body) {
          assert.equal(res.statusCode, 404);
        }))
        .end(done);
    });

    it('should accept remote devices of type testdriver, and allow them to set their own id properties', function(done) {
      request(getHttpServer(app))
        .post(url + '/devices')
        .send('type=testdriver&id=12345&name=test')
        .end(function(err, res) {
          getBody(function(res, body) {
            assert.equal(res.statusCode, 201);
            var query = Query.of('devices').where('id', { eq: '12345'});
            reg.find(query, function(err, machines) {
              assert.equal(machines.length, 1);
              assert.equal(machines[0].type, 'testdriver');
              assert.equal(machines[0].id, '12345');            
              done();
            });
          })(res);
        });
    });

    it('query for device should respond with properly formated api response', function(done) {
      request(getHttpServer(app))
        .get(url+'?server=local&ql=where%20type="testdriver"')
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
        .silent()
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
      var app = zetta({ registry: reg, peerRegistry: peerRegistry }).silent()._run();

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
        .silent()
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

    it('should allow the querying of peers with the ql parameter', function(done) {
      peerRegistry.save({ id: '1', type: 'initiator'}, function() {
        request(getHttpServer(app))
          .get('/peer-management?ql=where%20type%3D%22initiator%22')
          .expect(getBody(function(err, body) {
            assert.equal(body.entities.length, 1);
            var entity = body.entities[0];
            assert.equal(entity.properties.id, '1');  
          }))
          .end(done);  
      });  
    });

    describe('#link', function() {
      it('should return status code 202', function(done) {
        request(getHttpServer(app))
          .post('/peer-management')
          .send('url=http://testurl')
          .expect(202, done);
      });

      it('should return a Location header', function(done) {
        request(getHttpServer(app))
          .post('/peer-management')
          .send('url=http://testurl')
          .expect('Location', /^http.+/)
          .end(done);
      });
    });

    describe('#show', function() {
      it('should return the peer item representation', function(done) {
        var id = '1234-5678-9ABCD';
        peerRegistry.save({ id: id }, function() {
          request(getHttpServer(app))
            .get('/peer-management/' + id)
            .expect(200, done);
        });
      });
    });
  });

  describe('/devices of server', function() {
    var app = null;

    beforeEach(function(done) {
      app = zetta({ registry: reg, peerRegistry: peerRegistry })
        .silent()
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
        .silent()
        .use(Scout)
        .name('local')
        .expose('*')
        ._run(function() {
          device = app.runtime._jsDevices[Object.keys(app.runtime._jsDevices)[0]];
          url = '/servers/' + app._name + '/devices/' + device.id;
          done();
        });
    });

    it('should have content type application/vnd.siren+json', function(done) {
      request(getHttpServer(app))
        .get(url)
        .expect('Content-Type', 'application/vnd.siren+json', done);
    });

    it('class should be ["device", ":type"]', function(done) {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody(function(res, body) {
          assert(body.class.indexOf('device') >= 0);
          assert(body.class.indexOf(body.properties.type) >= 0);
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
          assert.equal(body.properties.name, device.name);
          assert.equal(body.properties.type, device.type);
          assert.equal(body.properties.id, device.id);
          assert.equal(body.properties.state, device.state);
        }))
        .end(done);
    });

    it('device should have action change', function(done) {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody(function(res, body) {
          assert.equal(body.actions.length, 3);
          var action = body.actions[0];
          assert.equal(action.name, 'change');
          assert.equal(action.method, 'POST');
          assert(action.href);
          assert.deepEqual(action.fields[0], { name: 'action', type: 'hidden', value: 'change' });
        }))
        .end(done);
    });

    it('device actions should have class "transition"', function(done) {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody(function(res, body) {
          assert.equal(body.actions.length, 3);
          body.actions.forEach(function(action) {
            assert(action.class.indexOf('transition') >= 0);
          })
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
          hasLinkRel(body.links, 'up', 'local');
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

    it('device should have monitor link for bar', function(done) {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody(function(res, body) {
          var fooBar = body.links.filter(function(link) {
            return link.title === 'foobar';
          });

          hasLinkRel(fooBar, rels.binaryStream);
        }))
        .end(done);
    });

    it('device action should return a 400 status code on a missing request body', function(done) {
      request(getHttpServer(app))
        .post(url)
        .send()
        .expect(getBody(function(res, body) {
          assert.equal(res.statusCode, 400);
        }))
        .end(done);
    });

    it('device action should return a 400 status code on an invalid request body', function(done) {
      request(getHttpServer(app))
        .post(url)
        .type('form')
        .send('{ "what": "invalid" }')
        .expect(getBody(function(res, body) {
          assert.equal(res.statusCode, 400);
        }))
        .end(done);
    });

    it('device action should work', function(done) {
      request(getHttpServer(app))
        .post(url)
        .type('form')
        .send({ action: 'test', value: 123 })
        .expect(getBody(function(res, body) {
          assert.equal(body.properties.value, 123);
          hasLinkRel(body.links, 'monitor');
        }))
        .end(done);
    });

    it('device action should return 400 when not available.', function(done) {
      request(getHttpServer(app))
        .post(url)
        .type('form')
        .send({ action: 'prepare' })
        .expect(getBody(function(res, body) {
          assert.equal(res.statusCode, 400);
        }))
        .end(done);
    });
    it('should return 500 when a error is passed in a callback of device driver', function(done) {
      request(getHttpServer(app))
        .post(url)
        .type('form')
        .send({ action: 'error', value: 'some error' })
        .expect(getBody(function(res, body) {
          assert.equal(res.statusCode, 500);
        }))
        .end(done);
    });


 });


});
