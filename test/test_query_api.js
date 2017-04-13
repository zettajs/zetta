const assert = require('assert');
const os = require('os');
const util = require('util');
const request = require('supertest');
const zetta = require('../');
const Query = require('calypso').Query;
const rels = require('zetta-rels');
const Scout = require('./fixture/example_scout');
const Driver = require('./fixture/example_driver');
const HttpDriver = require('./fixture/example_http_driver');
const Registry = require('./fixture/mem_registry');
const PeerRegistry = require('./fixture/mem_peer_registry');
const zettacluster = require('zetta-cluster');
const Scientist = require('zetta-scientist');
const Runtime = require('../zetta_runtime');
const Device = Runtime.Device;

class TestDriver extends Device {
  constructor() {
    super();
    this.foo = 'fooData';
    this.bar = 'barData';
    this.id = '123456789';
  }

  init(config) {
    config
      .name('Test')
      .type('testdriver')
      .state('ready');
  }
}


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
  assert.deepEqual(entity.class, ['device']);
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


describe('Zetta Query Api', () => {
  let reg = null;
  let peerRegistry = null;

  beforeEach(() => {
    reg = new Registry();
    peerRegistry = new PeerRegistry();
  });

  describe('invalid query', () => {
    let app = null;

    beforeEach(() => {
      app = zetta({ registry: reg, peerRegistry })
        .silent()
        .use(Scout)
        .name('local')
        .expose('*')
        ._run();
    });

    it('returns an error on /', done => {
      request(getHttpServer(app))
        .get('/?ql=where%20')
        .expect(getBody((res, body) => {
          assert.deepEqual(body.class, ['query-error']);
        }))
        .end(done);
    });

    it('returns an error on / when querying across servers', done => {
      request(getHttpServer(app))
        .get('/?server=*&ql=where%20')
        .expect(getBody((res, body) => {
          assert.deepEqual(body.class, ['query-error']);
        }))
        .end(done);
    });

    it('returns an error on /servers/<id>', done => {
      request(getHttpServer(app))
        .get('/servers/local?ql=where%20')
        .expect(getBody((res, body) => {
          assert.deepEqual(body.class, ['query-error']);
        }))
        .end(done);
    });
  });

  describe('queries on / with just a ql parameter', () => {
    let app = null;

    beforeEach(() => {
      app = zetta({ registry: reg, peerRegistry })
        .silent()
        .use(Scout)
        .name('local')
        .expose('*')
        ._run();
    });

    it('should have two classes', done => {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"')
        .expect(getBody((res, body) => {
          assert.deepEqual(body.class, ['server', 'search-results']);
        }))
        .end(done);
    });

    it('should have two properties: server name and ql', done => {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"')
        .expect(getBody((res, body) => {
          assert.equal(body.properties.name, 'local');
          assert.equal(body.properties.ql, 'where type = "testdriver"');
        }))
        .end(done);
    });

    it('should have one action.', done => {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"')
        .expect(getBody((res, body) => {
          assert.equal(body.actions.length, 1);
          assert.equal(body.actions[0].name, 'query-devices');
        }))
        .end(done);
    });

    it('should have a websocket link to monitor the query.', done => {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"')
        .expect(getBody((res, body) => {
          assert.equal(body.links.length, 4);
          hasLinkRel(body.links, 'http://rels.zettajs.io/query');
          assert.notEqual(body.links[3].href.indexOf("topic=query%2Fwhere%20type%20%3D%20%22testdriver%22"), -1);
        }))
        .end(done);
    });
  });

  describe('queries on / with a ql parameter and a server parameter', () => {
    let app = null;

    beforeEach(() => {
      app = zetta({ registry: reg, peerRegistry })
        .silent()
        .use(Scout)
        .name('local')
        .expose('*')
        ._run();
    });

    it('should have two classes', done => {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=local')
        .expect(getBody((res, body) => {
          assert.deepEqual(body.class, ['server', 'search-results']);
        }))
        .end(done);
    });

    it('should have two properties: server name and ql', done => {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=local')
        .expect(getBody((res, body) => {
          assert.equal(body.properties.name, 'local');
          assert.equal(body.properties.ql, 'where type = "testdriver"');
        }))
        .end(done);
    });

    it('should have no actions.', done => {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=local')
        .expect(getBody((res, body) => {
          assert.equal(body.actions.length, 1);
        }))
        .end(done);
    });

    it('should have a websocket link to monitor the query.', done => {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=local')
        .expect(getBody((res, body) => {
          assert.equal(body.links.length, 4);
          hasLinkRel(body.links, 'http://rels.zettajs.io/query');
          assert.notEqual(body.links[3].href.indexOf("topic=query%2Fwhere%20type%20%3D%20%22testdriver%22"), -1);
        }))
        .end(done);
    });
  });
  
  describe('queries on / with a ql parameter and a server parameter that is proxied to', () => {
    let app = null;
    let cluster = null;

    beforeEach(done => {
      cluster = zettacluster({ zetta })
        .server('cloud')
        .server('detroit1', [Scout], ['cloud'])
        .on('ready', () => {
          app = cluster.servers['cloud'];
          done();
        })
        .run(err => {
          if (err) {
            return done(err);
          }
        });
    });

    it('should have two classes', done => {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=detroit1')
        .expect(getBody((res, body) => {
          assert.deepEqual(body.class, ['root', 'search-results']);
        }))
        .end(done);
    });

    it('should have two properties: server name and ql', done => {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=detroit1')
        .expect(getBody((res, body) => {
          assert.equal(body.properties.server, 'detroit1');
          assert.equal(body.properties.ql, 'where type = "testdriver"');
        }))
        .end(done);
    });

    it('should have no actions.', done => {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=detroit1')
        .expect(getBody((res, body) => {
          assert.ok(!body.actions);
        }))
        .end(done);
    });

    it('should have a websocket link to monitor the query.', done => {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=detroit1')
        .expect(getBody((res, body) => {
          assert.equal(body.links.length, 3);
          hasLinkRel(body.links, 'http://rels.zettajs.io/query');
        }))
        .end(done);
    });
  });

  describe('queries on / for all peers', () => {
    let app = null;
    let cluster = null;

    beforeEach(done => {
      cluster = zettacluster({ zetta })
        .server('cloud')
        .server('detroit1', [Scout], ['cloud'])
        .server('detroit2', [Scout], ['cloud'])
        .on('ready', () => {
          app = cluster.servers['cloud'];
          done();
        })
        .run(err => {
          if (err) {
            return done(err);
          }
        });
    });

    it('should return results from each server', done => {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=*')
        .expect(getBody((res, body) => {
          assert.equal(body.entities.length, 2);
          hasLinkRel(body.links, 'http://rels.zettajs.io/query');
        }))
        .end(done);
    });
  });

  describe('Non provisioned devices', () => {
    let app = null;

    beforeEach(done => {
      const machine = Scientist.create(TestDriver);
      Scientist.init(machine);
      reg.save(machine, err => {
        assert.ok(!err);
        app = zetta({ registry: reg, peerRegistry })
          .silent()
          .use(Scout)
          .name('local')
          .expose('*')
          ._run();
        done();
      });
    });
    
    it('queries on /servers/<id> should return no results', done => {
      request(getHttpServer(app))
        .get('/servers/local?ql=where%20type%20=%20"testdriver"')
        .expect(getBody((res, body) => {
          assert.equal(body.entities.length, 1);
          body.entities.forEach(entity => {
            assert(entity.links);
          })
        }))
        .end(done);
    })

    it('queries on /?server=<server> should return no results', done => {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=local')
        .expect(getBody((res, body) => {
          assert.equal(body.entities.length, 1);
          body.entities.forEach(entity => {
            assert(entity.links);
          })
        }))
        .end(done);
    })

    it('queries on /?server=* should return no results', done => {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=*')
        .expect(getBody((res, body) => {
          assert.equal(body.entities.length, 1);
          body.entities.forEach(entity => {
            assert(entity.links);
          })
        }))
        .end(done);
    })

    it('queries on / should return no results', done => {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"')
        .expect(getBody((res, body) => {
          assert.equal(body.entities.length, 1);
          body.entities.forEach(entity => {
            assert(entity.links);
          })
        }))
        .end(done);
    })
  })
 
  describe('queries on /servers/<id>', () => {
    let app = null;

    beforeEach(() => {
      app = zetta({ registry: reg, peerRegistry })
        .silent()
        .use(Scout)
        .name('local')
        .expose('*')
        ._run();
    });

    it('should have two classes', done => {
      request(getHttpServer(app))
        .get('/servers/local?ql=where%20type%20=%20"testdriver"')
        .expect(getBody((res, body) => {
          assert.deepEqual(body.class, ['server', 'search-results']);
        }))
        .end(done);
    });

    it('should have two properties: server name and ql', done => {
      request(getHttpServer(app))
        .get('/servers/local?ql=where%20type%20=%20"testdriver"')
        .expect(getBody((res, body) => {
          assert.equal(body.properties.name, 'local');
          assert.equal(body.properties.ql, 'where type = "testdriver"');
        }))
        .end(done);
    });

    it('should have one action.', done => {
      request(getHttpServer(app))
        .get('/servers/local?ql=where%20type%20=%20"testdriver"')
        .expect(getBody((res, body) => {
          assert.equal(body.actions.length, 1);
          assert.equal(body.actions[0].name, 'query-devices');
        }))
        .end(done);
    });

    it('should have a websocket link to monitor the query.', done => {
      request(getHttpServer(app))
        .get('/servers/local?ql=where%20type%20=%20"testdriver"')
        .expect(getBody((res, body) => {
          assert.equal(body.links.length, 4);
          hasLinkRel(body.links, 'http://rels.zettajs.io/query');
          assert.notEqual(body.links[3].href.indexOf("topic=query%2Fwhere%20type%20%3D%20%22testdriver%22"), -1);
        }))
        .end(done);
    });


    it('should return empty list if no devices are provisioned on server', done => {
      const app = zetta({ registry: reg, peerRegistry })
        .silent()
        .name('local')
        ._run();
      
      request(getHttpServer(app))
        .get('/servers/local?ql=where%20type%20=%20"testdriver"')
        .expect(getBody((res, body) => {
          assert.equal(body.entities.length, 0);
          assert.deepEqual(body.class, ['server', 'search-results']);
        }))
        .end(done);
    });
  });

  describe('proxied queries on /servers/<id>', () => {
    let app = null;
    let cluster = null;

    beforeEach(done => {
      cluster = zettacluster({ zetta })
        .server('cloud')
        .server('detroit1', [Scout], ['cloud'])
        .on('ready', () => {
          app = cluster.servers['cloud'];
          done();
        })
        .run(err => {
          if (err) {
            return done(err);
          }
        });
 
    });
    
    it('should have two classes', done => {
      request(getHttpServer(app))
        .get('/servers/detroit1?ql=where%20type%20=%20"testdriver"')
        .expect(getBody((res, body) => {
          assert.deepEqual(body.class, ['server', 'search-results']);
        }))
        .end(done);
    });

    it('should have two properties: server name and ql', done => {
      request(getHttpServer(app))
        .get('/servers/detroit1?ql=where%20type%20=%20"testdriver"')
        .expect(getBody((res, body) => {
          assert.equal(body.properties.name, 'detroit1');
          assert.equal(body.properties.ql, 'where type = "testdriver"');
        }))
        .end(done);
    });

    it('should have one action.', done => {
      request(getHttpServer(app))
        .get('/servers/detroit1?ql=where%20type%20=%20"testdriver"')
        .expect(getBody((res, body) => {
          assert.equal(body.actions.length, 1);
          assert.equal(body.actions[0].name, 'query-devices');
        }))
        .end(done);
    });

    it('should have a websocket link to monitor the query.', done => {
      request(getHttpServer(app))
        .get('/servers/detroit1?ql=where%20type%20=%20"testdriver"')
        .expect(getBody((res, body) => {
          assert.equal(body.links.length, 4);
          hasLinkRel(body.links, 'http://rels.zettajs.io/query');
          assert.notEqual(body.links[3].href.indexOf("topic=query%2Fwhere%20type%20%3D%20%22testdriver%22"), -1);
        }))
        .end(done);
    });
  });
});
