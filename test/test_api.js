const assert = require('assert');
const http = require('http');
const os = require('os');
const request = require('supertest');
const spdy = require('spdy');
const zetta = require('../');
const Query = require('calypso').Query;
const rels = require('zetta-rels');
const zettacluster = require('zetta-cluster');
const Scout = require('./fixture/example_scout');
const Driver = require('./fixture/example_driver');
const HttpDriver = require('./fixture/example_http_driver');
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
  hasLinkRel(entity.links, rels.type);
  hasLinkRel(entity.links, rels.edit);
}

function hasLinkRel(links, rel, title, href) {
  let found = false;

  links.forEach(link => {
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
    throw new Error(`Link rel:${rel} not found in links`);
  }
}


describe('Zetta Api', () => {
  let reg = null;
  let peerRegistry = null;

  beforeEach(() => {
    reg = new Registry();
    peerRegistry = new PeerRegistry();
  });

  it('updates href hosts using x-forwarded-host header', done => {
    const app = zetta({ registry: reg, peerRegistry: peerRegistry  })
        .silent()
        .name('local')
        ._run(err => {
          if (err) {
            return done(err);
          }

          request(getHttpServer(app))
            .get('/')
            .set('x-forwarded-host', 'google.com')
            .expect(getBody((res, body) => {
              const self = body.links.filter(link => link.rel.indexOf('self') >= 0)[0];
              assert.equal(self.href, 'http://google.com/');
            }))
            .end(done);
        });
  })

  it('updates href path using x-forwarded-path header', done => {
    const app = zetta({ registry: reg, peerRegistry: peerRegistry  })
        .silent()
        .name('local')
        ._run(err => {
          if (err) {
            return done(err);
          }
          const rootPath = '/api/v1';
          request(getHttpServer(app))
            .get('/')
            .set('x-forwarded-path', rootPath)
            .expect(getBody((res, body) => {
              const self = body.links.filter(link => link.rel.indexOf('self') >= 0)[0];
              const resultPath = require('url').parse(self.href).pathname;
              assert.equal(resultPath.substr(0, rootPath.length), rootPath);
            }))
            .end(done);
        });
  })

  it('allow for x-forwarded-host header to be disabled', done => {
    const app = zetta({ registry: reg, peerRegistry: peerRegistry, useXForwardedHostHeader: false  })
        .silent()
        .name('local')
        ._run(err => {
          if (err) {
            return done(err);
          }

          request(getHttpServer(app))
            .get('/')
            .set('x-forwarded-host', 'google.com')
            .expect(getBody((res, body) => {
              const self = body.links.filter(link => link.rel.indexOf('self') >= 0)[0];
              assert.notEqual(self.href, 'http://google.com/');
            }))
            .end(done);
        });
  })

  it('allow for x-forwarded-path header to be disabled', done => {
    const app = zetta({ registry: reg, peerRegistry: peerRegistry, useXForwardedPathHeader: false  })
        .silent()
        .name('local')
        ._run(err => {
          if (err) {
            return done(err);
          }

          const rootPath = '/api/v1';

          request(getHttpServer(app))
            .get('/')
            .set('x-forwarded-path', rootPath)
            .expect(getBody((res, body) => {
              const self = body.links.filter(link => link.rel.indexOf('self') >= 0)[0];
              const resultPath = require('url').parse(self.href).pathname;
              const resultPathSub = resultPath.substr(0,rootPath.length);
              assert.notEqual(resultPathSub, rootPath);
              assert.equal(resultPathSub, '/');
            }))
            .end(done);
        });
  })

  describe('/servers/<peer id> ', () => {
    let app = null;
    let url = null;

    beforeEach(done => {
      app = zetta({ registry: reg, peerRegistry: peerRegistry })
        .silent()
        .properties({ custom: 123 })
        .use(Scout)
        .use(HttpDriver)
        .name('local')
        .expose('*')
        ._run(done);

      url = `/servers/${app._name}`;
    });

    it('should have content type application/vnd.siren+json', done => {
      request(getHttpServer(app))
        .get(url)
        .expect('Content-Type', 'application/vnd.siren+json', done);
    });

    it('should return status code 200', done => {
      request(getHttpServer(app))
        .get(url)
        .expect(200, done);
    });

    it('should have class ["server"]', done => {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody((res, body) => {
          assert.deepEqual(body.class, ['server']);
        }))
        .end(done);
    });

    it('should have proper name and id property', done => {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody((res, body) => {
          assert.equal(body.properties.name, 'local');
        }))
        .end(done);
    });

    it('should have custom properties in resp', done => {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody((res, body) => {
          assert.equal(body.properties.name, 'local');
          assert.equal(body.properties.custom, 123);
        }))
        .end(done);
    });

    it('should have self link and log link', done => {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody((res, body) => {
          assert(body.links);
          hasLinkRel(body.links, 'self');
          hasLinkRel(body.links, 'monitor');
        }))
        .end(done);
    });

    it('should have a metadata link', done => {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody((res, body) => {
          assert(body.links);
          hasLinkRel(body.links, rels.metadata);
        }))
        .end(done);
    });

    it('should have monitor log link formatted correctly for HTTP requests', done => {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody((res, body) => {
          const link = body.links.filter(l => l.rel.indexOf('monitor') > -1)[0];
          const obj = require('url').parse(link.href, true);
          assert.equal(obj.protocol, 'ws:');
          assert(obj.query.topic);
        }))
        .end(done);
    });

    it('should have monitor log link formatted correctly for SPDY requests', done => {
      const a = getHttpServer(app);

      if (!a.address()) a.listen(0);

      const agent = spdy.createAgent({
        host: '127.0.0.1',
        port: a.address().port,
        spdy: {
          plain: true,
          ssl: false
        }
      });

      const request = http.get({
        host: '127.0.0.1',
        port: a.address().port,
        path: url,
        agent: agent
      }, response => {

        const buffers = [];
        response.on('readable', () => {
          let data;
          while ((data = response.read()) !== null) {
            buffers.push(data);
          }
        });

        response.on('end', () => {
          const body = JSON.parse(Buffer.concat(buffers));
          const link = body.links.filter(l => l.rel.indexOf('monitor') > -1)[0];
          const obj = require('url').parse(link.href, true);
          assert.equal(obj.protocol, 'http:');
          assert(obj.query.topic);
          agent.close();
        });

        response.on('end', done);
      }).end();
    });

    it('should not have an events link for SPDY requests', done => {
      const a = getHttpServer(app);

      if (!a.address()) a.listen(0);

      const agent = spdy.createAgent({
        host: '127.0.0.1',
        port: a.address().port,
        spdy: {
          plain: true,
          ssl: false
        }
      });

      const request = http.get({
        host: '127.0.0.1',
        port: a.address().port,
        path: '/',
        agent: agent
      }, response => {

        const buffers = [];
        response.on('readable', () => {
          let data;
          while ((data = response.read()) !== null) {
            buffers.push(data);
          }
        });

        response.on('end', () => {
          const body = JSON.parse(Buffer.concat(buffers));
          const links = body.links.filter(l => l.rel.indexOf('http://rels.zettajs.io/events') > -1);
          assert.equal(links.length, 0);
          agent.close();
        });

        response.on('end', done);
      }).end();
    });

    it('should have valid entities', done => {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody((res, body) => {
          assert(body.entities);
          assert.equal(body.entities.length, 1);
          checkDeviceOnRootUri(body.entities[0]);
        }))
        .end(done);
    });

    it('should have one action', done => {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody((res, body) => {
          assert(body.actions);
          assert.equal(body.actions.length, 1);
        }))
        .end(done);
    });

    it('should accept remote devices of type testdriver', done => {
      request(getHttpServer(app))
        .post(`${url}/devices`)
        .send('type=testdriver')
        .end((err, res) => {
          getBody((res, body) => {
            assert.equal(res.statusCode, 201);
            const query = Query.of('devices');
            reg.find(query, (err, machines) => {
              assert.equal(machines.length, 2);
              assert.equal(machines[1].type, 'testdriver');
              done();
            });
          })(res);
        });
    });

    it('should not accept a remote device of type foo', done => {
      request(getHttpServer(app))
        .post(`${url}/devices`)
        .send('type=foo')
        .expect(getBody((res, body) => {
          assert.equal(res.statusCode, 404);
        }))
        .end(done);
    });

    it('should accept remote devices of type testdriver, and allow them to set their own id properties', done => {
      request(getHttpServer(app))
        .post(`${url}/devices`)
        .send('type=testdriver&id=12345&name=test')
        .end((err, res) => {
          getBody((res, body) => {
            assert.equal(res.statusCode, 201);
            const query = Query.of('devices').where('id', { eq: '12345'});
            reg.find(query, (err, machines) => {
              assert.equal(machines.length, 1);
              assert.equal(machines[0].type, 'testdriver');
              assert.equal(machines[0].id, '12345');
              done();
            });
          })(res);
        });
    });

    it('query for device should respond with properly formated api response', done => {
      request(getHttpServer(app))
        .get(`${url}?server=local&ql=where%20type="testdriver"`)
        .expect(getBody((res, body) => {
          assert(body.entities);
          assert.equal(body.entities.length, 1);
          checkDeviceOnRootUri(body.entities[0]);
        }))
        .end(done);
    });
  });

  describe('/', () => {
    let app = null;

    beforeEach(() => {
      app = zetta({ registry: reg, peerRegistry: peerRegistry })
        .silent()
        .use(Scout)
        .name('local')
        .expose('*')
        ._run();
    });

    it('should have content type application/vnd.siren+json', done => {
      request(getHttpServer(app))
        .get('/')
        .expect('Content-Type', 'application/vnd.siren+json', done);
    });

    it('should have status code 200', done => {
      request(getHttpServer(app))
        .get('/')
        .expect(200, done);
    });

    it('body should contain class ["root"]', done => {
      request(getHttpServer(app))
        .get('/')
        .expect(getBody((res, body) => {
          assert.deepEqual(body.class, ['root']);
      }))
      .end(done)
    });


    it('body should contain links property', done => {
      request(getHttpServer(app))
        .get('/')
        .expect(getBody((res, body) => {
          assert.equal(body.links.length, 4);
          hasLinkRel(body.links, 'self');
        }))
        .end(done)
    });

    it('links should contain rel to server', done => {
      request(getHttpServer(app))
        .get('/')
        .expect(getBody((res, body) => {
          hasLinkRel(body.links, rels.server);
        }))
        .end(done)
    });

    it('should contain link for event stream', done => {
      request(getHttpServer(app))
        .get('/')
        .expect(getBody((res, body) => {
          hasLinkRel(body.links, rels.events);
        }))
        .end(done)
    });

    it('should use a default server name if none has been provided', done => {
      const app = zetta({ registry: reg, peerRegistry: peerRegistry }).silent()._run();

      request(getHttpServer(app))
        .get('/')
        .expect(getBody((res, body) => {
          const self = body.links.filter(link => link.rel.indexOf(rels.server) !== -1)[0];

          assert.equal(self.title, os.hostname());
        }))
        .end(done);
    });
  });

  describe('/peer-management', () => {
    let app = null;

    before(done => {
      peerRegistry.save({
        id: '12341234',
        name: 'test-peer'
      }, done);
    });

    beforeEach(done => {
      app = zetta({ registry: reg, peerRegistry: peerRegistry })
        .silent()
        .use(Scout)
        .name('local')
        .expose('*')
        ._run(done);
    });

    it('should have content type application/vnd.siren+json', done => {
      request(getHttpServer(app))
        .get('/peer-management')
        .expect('Content-Type', 'application/vnd.siren+json', done);
    });

    it('should return status code 200', done => {
      request(getHttpServer(app))
        .get('/peer-management')
        .expect(200, done);
    });

    it('should have class ["peer-management"]', done => {
      request(getHttpServer(app))
        .get('/peer-management')
        .expect(getBody((err, body) => {
          assert.deepEqual(body.class, ['peer-management']);
        }))
        .end(done);
    });

    it('subentities should have rel ["item"]', done => {
      peerRegistry.save({ id: '0' }, () => {
        request(getHttpServer(app))
          .get('/peer-management')
          .expect(getBody((err, body) => {
            body.entities.forEach(entity => {
              assert(entity.rel.indexOf('item') >= 0)
            })
          }))
          .end(done);
      });
    });

    it('should list saved peers', done => {
      peerRegistry.save({ id: '0' }, () => {
        request(getHttpServer(app))
          .get('/peer-management')
          .expect(getBody((err, body) => {
            assert.equal(body.entities.length, 1);
          }))
          .end(done);
      });
    });

    it('should allow the querying of peers with the ql parameter', done => {
      peerRegistry.save({ id: '1', type: 'initiator'}, () => {
        request(getHttpServer(app))
          .get('/peer-management?ql=where%20type%3D%22initiator%22')
          .expect(getBody((err, body) => {
            assert.equal(body.entities.length, 1);
            const entity = body.entities[0];
            assert.equal(entity.properties.id, '1');
          }))
          .end(done);
      });
    });

    describe('#link', () => {
      it('should return status code 202', done => {
        request(getHttpServer(app))
          .post('/peer-management')
          .send('url=http://testurl')
          .expect(202, done);
      });

      it('should return a Location header', done => {
        request(getHttpServer(app))
          .post('/peer-management')
          .send('url=http://testurl')
          .expect('Location', /^http.+/)
          .end(done);
      });

      it('should return Location header whose value honors forwarded host', done => {
        request(getHttpServer(app))
          .post('/peer-management')
          .set('x-forwarded-host', 'google.com')
          .send('url=http://testurl')
          .expect('Location', /^http.+/)
          .expect(res => {
            const loc = res.headers['location'];
            const locHost = require('url').parse(loc).hostname;
            assert.equal(locHost, 'google.com');
          })
          .end(done);
      });

      it('should return Location header whose value honors forwarded path', done => {
        const rootPath = '/ipa/1v';
        request(getHttpServer(app))
          .post('/peer-management')
          .set('x-forwarded-path', rootPath)
          .send('url=http://testurl')
          .expect('Location', /^http.+/)
          .expect(res => {
            const loc = res.headers['location'];
            const locPath = require('url').parse(loc).pathname;
            assert.equal(locPath.substr(0,rootPath.length), rootPath);
          })
          .end(done);
      });
    });

    describe('#show', () => {
      it('should return the peer item representation', done => {
        const id = '1234-5678-9ABCD';
        peerRegistry.save({ id: id }, () => {
          request(getHttpServer(app))
            .get(`/peer-management/${id}`)
            .expect(200, done);
        });
      });
    });
  });

  describe('/devices of server', () => {
    let app = null;

    beforeEach(done => {
      app = zetta({ registry: reg, peerRegistry: peerRegistry })
        .silent()
        .use(Scout)
        .name('local')
        .expose('*')
        ._run(done);
    });

    it('should have content type application/vnd.siren+json', done => {
      request(getHttpServer(app))
        .get('/devices')
        .expect('Content-Type', 'application/vnd.siren+json', done);
    });

    it('should return status code 200', done => {
      request(getHttpServer(app))
        .get('/devices')
        .expect(200, done);
    });

    it('should have class ["devices"]', done => {
      request(getHttpServer(app))
        .get('/devices')
        .expect(getBody((res, body) => {
          assert.deepEqual(body.class, ['devices']);
        }))
        .end(done);
    });

    it('should have one valid entity', done => {
      request(getHttpServer(app))
        .get('/devices')
        .expect(getBody((res, body) => {
          assert(body.entities);
          assert.equal(body.entities.length, 1);
          checkDeviceOnRootUri(body.entities[0]);
          hasLinkRel(body.links, 'self');
        }))
        .end(done);
    });

    it('should replace url host in all device links using forwarded host', done => {
      const rootPath = '/alpha/v1';
      request(getHttpServer(app))
        .get('/devices')
        .set('x-forwarded-host', 'google.ca')
        .expect(getBody((res, body) => {
          body.links.forEach(link => {
            const linkHost = require('url').parse(link.href).hostname;
            assert.equal(linkHost, 'google.ca');
          });
        }))
        .end(done);
    });

    it('should inject path in all device links using forwared root path', done => {
      const rootPath = '/alpha/v1';
      request(getHttpServer(app))
        .get('/devices')
        .set('x-forwarded-path', rootPath)
        .expect(getBody((res, body) => {
          body.links.forEach(link => {
            const linkPath = require('url').parse(link.href).pathname;
            assert.equal(linkPath.substr(0,rootPath.length), rootPath);
          });
        }))
        .end(done);
    });
  });




  describe('/servers/:id/devices/:id', () => {
    let app = null;
    let url = null;
    let device = null;

    beforeEach(done => {
      app = zetta({ registry: reg, peerRegistry: peerRegistry })
        .silent()
        .use(Scout)
        .name('local')
        .expose('*')
        ._run(() => {
          device = app.runtime._jsDevices[Object.keys(app.runtime._jsDevices)[0]];
          url = `/servers/${app._name}/devices/${device.id}`;
          done();
        });
    });

    it('should have content type application/vnd.siren+json', done => {
      request(getHttpServer(app))
        .get(url)
        .expect('Content-Type', 'application/vnd.siren+json', done);
    });

    it('class should be ["device", ":type"]', done => {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody((res, body) => {
          assert(body.class.indexOf('device') >= 0);
          assert(body.class.indexOf(body.properties.type) >= 0);
        }))
        .end(done);
    });

    /*
          checkDeviceOnRootUri(body.entities[0]);
          hasLinkRel(body.links, 'self');

     */

    it('properties should match expected', done => {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody((res, body) => {
          assert(body.properties);
          assert.equal(body.properties.name, device.name);
          assert.equal(body.properties.type, device.type);
          assert.equal(body.properties.id, device.id);
          assert.equal(body.properties.state, device.state);
        }))
        .end(done);
    });

    it('device should have action change', done => {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody((res, body) => {
          assert.equal(body.actions.length, 8);
          const action = body.actions[0];
          assert.equal(action.name, 'change');
          assert.equal(action.method, 'POST');
          assert(action.href);
          assert.deepEqual(action.fields[0], { name: 'action', type: 'hidden', value: 'change' });
        }))
        .end(done);
    });

    it('device actions should have class "transition"', done => {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody((res, body) => {
          assert.equal(body.actions.length, 8);
          body.actions.forEach(action => {
            assert(action.class.indexOf('transition') >= 0);
          })
        }))
        .end(done);
    });


    it('device should have self link', done => {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody((res, body) => {
          hasLinkRel(body.links, 'self');
        }))
        .end(done);
    });

    it('device should have edit link', done => {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody((res, body) => {
          hasLinkRel(body.links, 'edit');
        }))
        .end(done);
    });

    it('device should have up link to server', done => {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody((res, body) => {
          hasLinkRel(body.links, 'up', 'local');
        }))
        .end(done);
    });

    it('device should have monitor link for bar', done => {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody((res, body) => {
          hasLinkRel(body.links, 'monitor');
        }))
        .end(done);
    });

    it('disabling a stream should remove it from the API.', done => {
      Object.keys(app.runtime._jsDevices).forEach(name => {
        const device = app.runtime._jsDevices[name];
        device.disableStream('foo');
      });

      request(getHttpServer(app))
        .get(url)
        .expect(getBody((res, body) => {
          const foo = body.links.filter(link => link.title === 'foo');

          assert.equal(foo.length, 0);
        }))
        .end(done);
    });

    it('enabling a stream should show it in the API.', done => {
      let device = null;
      Object.keys(app.runtime._jsDevices).forEach(name => {
        device = app.runtime._jsDevices[name];
        device.disableStream('foo');
        device.enableStream('foo');
      });

      request(getHttpServer(app))
        .get(url)
        .expect(getBody((res, body) => {
          const foo = body.links.filter(link => link.title === 'foo');

          assert.equal(foo.length, 1);
        }))
        .end(done);
    });

    it('device should have monitor link for bar formatted correctly for HTTP requests', done => {
      request(getHttpServer(app))
        .get(url)
        .expect(getBody((res, body) => {
          const fooBar = body.links.filter(link => link.title === 'foobar');

          hasLinkRel(fooBar, rels.binaryStream);
          const parsed = require('url').parse(fooBar[0].href);
          assert.equal(parsed.protocol, 'ws:');
        }))
        .end(done);
    });

    it('should have a monitor link for bar formatted correctly for SPDY requests', done => {
      const a = getHttpServer(app);

      if (!a.address()) a.listen(0);

      const agent = spdy.createAgent({
        host: '127.0.0.1',
        port: a.address().port,
        spdy: {
          plain: true,
          ssl: false
        }
      });

      const request = http.get({
        host: '127.0.0.1',
        port: a.address().port,
        path: url,
        agent: agent
      }, response => {

        const buffers = [];
        response.on('readable', () => {
          let data;
          while ((data = response.read()) !== null) {
            buffers.push(data);
          }
        });

        response.on('end', () => {
          const body = JSON.parse(Buffer.concat(buffers));
          const fooBar = body.links.filter(link => link.title === 'foobar');

          hasLinkRel(fooBar, rels.binaryStream);
          const parsed = require('url').parse(fooBar[0].href);
          assert.equal(parsed.protocol, 'http:');
          agent.close();
        });

        response.on('end', done);
      }).end();
    });

    it('device action should return a 400 status code on a missing request body', done => {
      request(getHttpServer(app))
        .post(url)
        .send()
        .expect(getBody((res, body) => {
          assert.equal(res.statusCode, 400);
        }))
        .end(done);
    });

    it('device action should return a 400 status code on an invalid request body', done => {
      request(getHttpServer(app))
        .post(url)
        .type('form')
        .send('{ "what": "invalid" }')
        .expect(getBody((res, body) => {
          assert.equal(res.statusCode, 400);
        }))
        .end(done);
    });

    it('device action should work', done => {
      request(getHttpServer(app))
        .post(url)
        .type('form')
        .send({ action: 'test', value: 123 })
        .expect(getBody((res, body) => {
          assert.equal(body.properties.value, 123);
          hasLinkRel(body.links, 'monitor');
        }))
        .end(done);
    });

    it('device action should support extended characters', done => {
      request(getHttpServer(app))
        .post(url)
        .type('form')
        .send({ action: 'test-text', value: "🙌💸🙌" })
        .expect(getBody((res, body) => {
          assert.equal(body.properties.message, "🙌💸🙌");
        }))
        .end(done);
    });

    const createTransitionArgTest = (action, testType, input) => {
      it(`api should decode transition args to ${testType} for ${action}`, done => {
        const device = app.runtime._jsDevices[Object.keys(app.runtime._jsDevices)[0]];

        const orig = device._transitions[action].handler;
        device._transitions[action].handler = function(x) {
          assert.equal(typeof x, testType);
          orig.apply(device, arguments);
        };

        request(getHttpServer(app))
          .post(url)
          .type('form')
          .expect(200)
          .send({ action: action, value: input })
          .end(done);
      });
    };

    createTransitionArgTest('test-number', 'number', 123)
    createTransitionArgTest('test-text', 'string', 'Hello');
    createTransitionArgTest('test-none', 'string', 'Anything');
    createTransitionArgTest('test-date', 'object', '2015-01-02');

    it('api should respond with 400 when argument is not expected number', done => {
      request(getHttpServer(app))
        .post(url)
        .type('form')
        .expect(400)
        .expect(getBody((res, body) => {
          assert(body.class.indexOf('input-error') > -1);
          assert.equal(body.properties.errors.length, 1);
        }))
        .send({ action: 'test-number', value: 'some string' })
        .end(done);
    })

    it('api should respond with 400 when argument is not expected Date', done => {
      request(getHttpServer(app))
        .post(url)
        .type('form')
        .expect(400)
        .expect(getBody((res, body) => {
          assert(body.class.indexOf('input-error') > -1);
          assert.equal(body.properties.errors.length, 1);
        }))
        .send({ action: 'test-date', value: 'some string' })
        .end(done);
    })

    it('device action should return 400 when not available.', done => {
      request(getHttpServer(app))
        .post(url)
        .type('form')
        .send({ action: 'prepare' })
        .expect(getBody((res, body) => {
          assert.equal(res.statusCode, 400);
        }))
        .end(done);
    });

    it('should return 500 when a error is passed in a callback of device driver', done => {
      request(getHttpServer(app))
        .post(url)
        .type('form')
        .send({ action: 'error', error: 'some error' })
        .expect(getBody((res, body) => {
          assert.equal(res.statusCode, 500);
          assert(body.class.indexOf('action-error') >= 0);
          assert(body.properties.message);
          assert.equal(body.properties.message, 'some error');

          hasLinkRel(body.links, rels.self);
        }))
        .end(done);
    });

    it('should return custom error information when a error is passed in a callback of device driver', done => {
      request(getHttpServer(app))
        .post(url)
        .type('form')
        .send({action: 'test-custom-error'})
        .expect(getBody((res, body) => {
          assert.equal(res.statusCode, 401);
          assert(body.class.indexOf('action-error') >= 0);

          assert(body.properties.message);
          assert.equal('custom error message', body.properties.message);

          hasLinkRel(body.links, rels.self);
        }))
        .end(done);
    });

    it('should support device updates using PUT', done => {
      request(getHttpServer(app))
        .put(url)
        .type('json')
        .send({ bar: 2, value: 3 })
        .expect(getBody((res, body) => {
          assert.equal(res.statusCode, 200);
          assert.equal(body.properties.bar, 2);
          assert.equal(body.properties.value, 3);
        }))
        .end(done);
    });

    it('should support device deletes using DELETE', done => {
      request(getHttpServer(app))
        .del(url)
        .expect(getBody((res, body) => {
          assert.equal(res.statusCode, 204);
          assert.equal(Object.keys(app.runtime._jsDevices).length, 0);
        }))
        .end(done);

    });

    it('remoteDestroy hook should prevent the device from being destroyed with a DELETE', done => {
      const deviceKey = Object.keys(app.runtime._jsDevices)[0];
      const device = app.runtime._jsDevices[deviceKey];

      const remoteDestroy = cb => {
        cb(null, false);
      };

      device._remoteDestroy = remoteDestroy.bind(device);

      request(getHttpServer(app))
        .del(url)
        .expect(getBody((res, body) => {
          assert.equal(res.statusCode, 500);
          assert.equal(Object.keys(app.runtime._jsDevices).length, 1);
        }))
        .end(done);

    });

    it('remoteDestroy hook should prevent the device from being destroyed with a DELETE if callback has an error', done => {
      const deviceKey = Object.keys(app.runtime._jsDevices)[0];
      const device = app.runtime._jsDevices[deviceKey];

      const remoteDestroy = cb => {
        cb(new Error('Oof! Ouch!'));
      };

      device._remoteDestroy = remoteDestroy.bind(device);

      request(getHttpServer(app))
        .del(url)
        .expect(getBody((res, body) => {
          assert.equal(res.statusCode, 500);
          assert.equal(Object.keys(app.runtime._jsDevices).length, 1);
        }))
        .end(done);

    });

    it('remoteDestroy hook should allow the device to be destroyed when callback is called with true', done => {
      const deviceKey = Object.keys(app.runtime._jsDevices)[0];
      const device = app.runtime._jsDevices[deviceKey];

      const remoteDestroy = cb => {
        cb(null, true);
      };

      device._remoteDestroy = remoteDestroy.bind(device);

      request(getHttpServer(app))
        .del(url)
        .expect(getBody((res, body) => {
          assert.equal(res.statusCode, 204);
          assert.equal(Object.keys(app.runtime._jsDevices).length, 0);
        }))
        .end(done);

    });

    it('should not overwrite monitor properties using PUT', done => {
      request(getHttpServer(app))
        .put(url)
        .type('json')
        .send({ foo: 1 })
        .expect(getBody((res, body) => {
          assert.equal(res.statusCode, 200);
          assert.equal(body.properties.foo, 0);
        }))
        .end(done);
     });

    it('should return a 404 when updating a non-existent device', done => {
      request(getHttpServer(app))
        .put(`${url}1234567890`)
        .type('json')
        .send({ foo: 1, bar: 2, value: 3 })
        .expect(res => {
          assert.equal(res.statusCode, 404);
        })
        .end(done);
    });

    it('should return a 400 when updating with a Content-Range header', done => {
      request(getHttpServer(app))
        .put(url)
        .set('Content-Range', 'bytes 0-499/1234')
        .type('json')
        .send({ foo: 1, bar: 2, value: 3 })
        .expect(res => {
          assert.equal(res.statusCode, 400);
        })
        .end(done);
    });

    it('should return a 400 when receiving invalid JSON input', done => {
      request(getHttpServer(app))
        .put(url)
        .type('json')
        .send('{"name":}')
        .expect(res => {
          assert.equal(res.statusCode, 400);
        })
        .end(done);
    });

    it('should not include reserved fields on device updates', done => {
      const input = { foo: 1, bar: 2, value: 3, id: 'abcdef',
        _x: 4, type: 'h', state: 'yo', streams: 's' };

      request(getHttpServer(app))
        .put(url)
        .type('json')
        .send(input)
        .expect(getBody((res, body) => {
          assert.equal(res.statusCode, 200);
          assert.notEqual(body.properties.id, 'abcdef');
          assert.notEqual(body.properties._x, 4);
          assert.notEqual(body.properties.streams, 's');
          assert.notEqual(body.properties.state, 'yo');
          assert.notEqual(body.properties.type, 'h');
        }))
        .end(done);
    });
 });

  describe('Proxied requests', () => {
    let base = null;
    let cloudUrl = null;
    let cluster = null;

    beforeEach(done => {
      cluster = zettacluster({ zetta: zetta })
        .server('cloud')
        .server('detroit', [Scout], ['cloud'])
        .server('sanjose', [Scout], ['cloud'])
        .on('ready', () => {
          cloudUrl = `localhost:${cluster.servers['cloud']._testPort}`;
          base = `localhost:${cluster.servers['cloud']._testPort}/servers/${cluster.servers['cloud'].locatePeer('detroit')}`;
          setTimeout(done, 300);
        })
        .run(err => {
          console.log(err)
          if (err) {
            done(err);
          }
        });
    });

    afterEach(done => {
      cluster.stop();
      setTimeout(done, 10); // fix issues with server not being closed before a new one starts
    });

    it('zetta should not crash when req to hub is pending and hub disconnects', done => {
      http.get(`http://${base}`, res => {
        assert.equal(res.statusCode, 502);
        done();
      }).on('socket', socket => {
        socket.on('connect', () => {
          cluster.servers['cloud'].httpServer.peers['detroit'].close();
        });
      })
    })

    it('zetta should return 404 on non-existent peer', done => {
      http.get(`http://${cloudUrl}/servers/some-peer`, res => {
        assert.equal(res.statusCode, 404);
        done();
      })
    })

    it('zetta should return 404 on disconnected peer', done => {
      cluster.servers['detroit']._peerClients[0].close()
      http.get(`http://${cloudUrl}/servers/detroit`, res => {
        assert.equal(res.statusCode, 404);
        done();
      })
    })

    it('device action should support extended characters throw a proxied connection', done => {

      const device = cluster.servers['detroit'].runtime._jsDevices[Object.keys(cluster.servers['detroit'].runtime._jsDevices)[0]];

      request(getHttpServer(cluster.servers['cloud']))
        .post(`/servers/detroit/devices/${device.id}`)
        .type('form')
        .send({ action: 'test-text', value: "🙌💸🙌" })
        .expect(getBody((res, body) => {
          assert.equal(body.properties.message, "🙌💸🙌");
        }))
        .end(done);
    });


  })

  describe('Server name issues', () => {
    let cluster;
    const hubName = 'hub 1';
    const getServer = peerName => cluster.servers[peerName].httpServer.server;
    beforeEach(done => {
      cluster = zettacluster({ zetta: zetta })
        .server('cloud')
        .server(hubName, [Scout], ['cloud'])
        .on('ready', done)
        .run(err => {
          if (err) {
            done(err);
          }
        });
    });

    it('server name with space has correct path to root of server', done => {
      request(getServer('cloud'))
        .get('/')
        .expect(getBody((res, body) => {
          const link = body.links.filter(link => link.title === hubName)[0];
          const parsed = require('url').parse(link.href);
          assert.equal(decodeURI(parsed.path), `/servers/${hubName}`);
        }))
        .end(done);
    })

    it('server name with space has correct path to device', done => {
      request(getServer('cloud'))
        .get(`/servers/${hubName}`)
        .expect(getBody((res, body) => {
          body.entities.forEach(entity => {
            entity.links.forEach(link => {
              const parsed = require('url').parse(link.href);
              assert.equal(decodeURI(parsed.path).indexOf(`/servers/${hubName}`), 0);
            });
          });
        }))
        .end(done);
    })
  })


});
