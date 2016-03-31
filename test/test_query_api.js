var assert = require('assert');
var os = require('os');
var util = require('util');
var request = require('supertest');
var zetta = require('../');
var Query = require('calypso').Query;
var rels = require('zetta-rels');
var Scout = require('./fixture/example_scout');
var Driver = require('./fixture/example_driver');
var HttpDriver = require('./fixture/example_http_driver');
var Registry = require('./fixture/mem_registry');
var PeerRegistry = require('./fixture/mem_peer_registry');
var zettacluster = require('zetta-cluster');
var Scientist = require('zetta-scientist');
var Runtime = require('../zetta_runtime');
var Device = Runtime.Device;

function TestDriver() {
  Device.call(this);
  this.foo = 'fooData';
  this.bar = 'barData';
  this.id = '123456789';
}
util.inherits(TestDriver, Device);

TestDriver.prototype.init = function(config) {
  config
    .name('Test')
    .type('testdriver')
    .state('ready');
};


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


describe('Zetta Query Api', function() {
  var reg = null;
  var peerRegistry = null;

  beforeEach(function() {
    reg = new Registry();
    peerRegistry = new PeerRegistry();
  });

  describe('invalid query', function() {
    var app = null;

    beforeEach(function() {
      app = zetta({ registry: reg, peerRegistry: peerRegistry })
        .silent()
        .use(Scout)
        .name('local')
        .expose('*')
        ._run();
    });

    it('returns an error on /', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20')
        .expect(getBody(function(res, body){
          assert.deepEqual(body.class, ['query-error']);
        }))
        .end(done);
    });

    it('returns an error on / when querying across servers', function(done) {
      request(getHttpServer(app))
        .get('/?server=*&ql=where%20')
        .expect(getBody(function(res, body){
          assert.deepEqual(body.class, ['query-error']);
        }))
        .end(done);
    });

    it('returns an error on /servers/<id>', function(done) {
      request(getHttpServer(app))
        .get('/servers/local?ql=where%20')
        .expect(getBody(function(res, body){
          assert.deepEqual(body.class, ['query-error']);
        }))
        .end(done);
    });
  });

  describe('queries on / with just a ql parameter', function() {
    var app = null;

    beforeEach(function() {
      app = zetta({ registry: reg, peerRegistry: peerRegistry })
        .silent()
        .use(Scout)
        .name('local')
        .expose('*')
        ._run();
    });

    it('should have two classes', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"')
        .expect(getBody(function(res, body){
          assert.deepEqual(body.class, ['server', 'search-results']);
        }))
        .end(done);
    });

    it('should have two properties: server name and ql', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"')
        .expect(getBody(function(res, body) {
          assert.equal(body.properties.name, 'local');
          assert.equal(body.properties.ql, 'where type = "testdriver"');
        }))
        .end(done);
    });

    it('should have one action.', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"')
        .expect(getBody(function(res, body) {
          assert.equal(body.actions.length, 1);
          assert.equal(body.actions[0].name, 'query-devices');
        }))
        .end(done);
    });

    it('should have a websocket link to monitor the query.', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"')
        .expect(getBody(function(res, body) {
          assert.equal(body.links.length, 4);
          hasLinkRel(body.links, 'http://rels.zettajs.io/query');
          assert.notEqual(body.links[3].href.indexOf("topic=query%2Fwhere%20type%20%3D%20%22testdriver%22"), -1);
        }))
        .end(done);
    });
  });

  describe('queries on / with a ql parameter and a server parameter', function() {
    var app = null;

    beforeEach(function() {
      app = zetta({ registry: reg, peerRegistry: peerRegistry })
        .silent()
        .use(Scout)
        .name('local')
        .expose('*')
        ._run();
    });

    it('should have two classes', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=local')
        .expect(getBody(function(res, body){
          assert.deepEqual(body.class, ['server', 'search-results']);
        }))
        .end(done);
    });

    it('should have two properties: server name and ql', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=local')
        .expect(getBody(function(res, body) {
          assert.equal(body.properties.name, 'local');
          assert.equal(body.properties.ql, 'where type = "testdriver"');
        }))
        .end(done);
    });

    it('should have no actions.', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=local')
        .expect(getBody(function(res, body) {
          assert.equal(body.actions.length, 1);
        }))
        .end(done);
    });

    it('should have a websocket link to monitor the query.', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=local')
        .expect(getBody(function(res, body) {
          assert.equal(body.links.length, 4);
          hasLinkRel(body.links, 'http://rels.zettajs.io/query');
          assert.notEqual(body.links[3].href.indexOf("topic=query%2Fwhere%20type%20%3D%20%22testdriver%22"), -1);
        }))
        .end(done);
    });
  });
  
  describe('queries on / with a ql parameter and a server parameter that is proxied to', function() {
    var app = null;
    var cluster = null;

    beforeEach(function(done) {
      cluster = zettacluster({ zetta: zetta })
        .server('cloud')
        .server('detroit1', [Scout], ['cloud'])
        .on('ready', function() {
          app = cluster.servers['cloud'];
          done();
        })
        .run(function(err){
          if (err) {
            return done(err);
          }
        });
    });

    it('should have two classes', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=detroit1')
        .expect(getBody(function(res, body){
          assert.deepEqual(body.class, ['root', 'search-results']);
        }))
        .end(done);
    });

    it('should have two properties: server name and ql', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=detroit1')
        .expect(getBody(function(res, body) {
          assert.equal(body.properties.server, 'detroit1');
          assert.equal(body.properties.ql, 'where type = "testdriver"');
        }))
        .end(done);
    });

    it('should have no actions.', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=detroit1')
        .expect(getBody(function(res, body) {
          assert.ok(!body.actions);
        }))
        .end(done);
    });

    it('should have a websocket link to monitor the query.', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=detroit1')
        .expect(getBody(function(res, body) {
          assert.equal(body.links.length, 3);
          hasLinkRel(body.links, 'http://rels.zettajs.io/query');
        }))
        .end(done);
    });
  });

  describe('queries on / for all peers', function() {
    var app = null;
    var cluster = null;

    beforeEach(function(done) {
      cluster = zettacluster({ zetta: zetta })
        .server('cloud')
        .server('detroit1', [Scout], ['cloud'])
        .server('detroit2', [Scout], ['cloud'])
        .on('ready', function() {
          app = cluster.servers['cloud'];
          done();
        })
        .run(function(err){
          if (err) {
            return done(err);
          }
        });
    });

    it('should return results from each server', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=*')
        .expect(getBody(function(res, body) {
          assert.equal(body.entities.length, 2);
          hasLinkRel(body.links, 'http://rels.zettajs.io/query');
        }))
        .end(done);
    });
  });

  describe('Non provisioned devices', function() {
    beforeEach(function(done) {
      machine = Scientist.create(TestDriver);
      Scientist.init(machine);
      reg.save(machine, function(err) {
        assert.ok(!err);
        app = zetta({ registry: reg, peerRegistry: peerRegistry })
          .silent()
          .use(Scout)
          .name('local')
          .expose('*')
          ._run();
        done();
      });
    });
    
    it('queries on /servers/<id> should return no results', function(done) {
      request(getHttpServer(app))
        .get('/servers/local?ql=where%20type%20=%20"testdriver"')
        .expect(getBody(function(res, body) {
          assert.equal(body.entities.length, 1);
          body.entities.forEach(function(entity) {
            assert(entity.links);
          })
        }))
        .end(done);
    })

    it('queries on /?server=<server> should return no results', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=local')
        .expect(getBody(function(res, body) {
          assert.equal(body.entities.length, 1);
          body.entities.forEach(function(entity) {
            assert(entity.links);
          })
        }))
        .end(done);
    })

    it('queries on /?server=* should return no results', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=*')
        .expect(getBody(function(res, body) {
          assert.equal(body.entities.length, 1);
          body.entities.forEach(function(entity) {
            assert(entity.links);
          })
        }))
        .end(done);
    })

    it('queries on / should return no results', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"')
        .expect(getBody(function(res, body) {
          assert.equal(body.entities.length, 1);
          body.entities.forEach(function(entity) {
            assert(entity.links);
          })
        }))
        .end(done);
    })
  })
 
  describe('queries on /servers/<id>', function() {
    var app = null;

    beforeEach(function() {
      app = zetta({ registry: reg, peerRegistry: peerRegistry })
        .silent()
        .use(Scout)
        .name('local')
        .expose('*')
        ._run();
    });

    it('should have two classes', function(done) {
      request(getHttpServer(app))
        .get('/servers/local?ql=where%20type%20=%20"testdriver"')
        .expect(getBody(function(res, body){
          assert.deepEqual(body.class, ['server', 'search-results']);
        }))
        .end(done);
    });

    it('should have two properties: server name and ql', function(done) {
      request(getHttpServer(app))
        .get('/servers/local?ql=where%20type%20=%20"testdriver"')
        .expect(getBody(function(res, body) {
          assert.equal(body.properties.name, 'local');
          assert.equal(body.properties.ql, 'where type = "testdriver"');
        }))
        .end(done);
    });

    it('should have one action.', function(done) {
      request(getHttpServer(app))
        .get('/servers/local?ql=where%20type%20=%20"testdriver"')
        .expect(getBody(function(res, body) {
          assert.equal(body.actions.length, 1);
          assert.equal(body.actions[0].name, 'query-devices');
        }))
        .end(done);
    });

    it('should have a websocket link to monitor the query.', function(done) {
      request(getHttpServer(app))
        .get('/servers/local?ql=where%20type%20=%20"testdriver"')
        .expect(getBody(function(res, body) {
          assert.equal(body.links.length, 4);
          hasLinkRel(body.links, 'http://rels.zettajs.io/query');
          assert.notEqual(body.links[3].href.indexOf("topic=query%2Fwhere%20type%20%3D%20%22testdriver%22"), -1);
        }))
        .end(done);
    });


    it('should return empty list if no devices are provisioned on server', function(done) {
      var app = zetta({ registry: reg, peerRegistry: peerRegistry })
        .silent()
        .name('local')
        ._run();
      
      request(getHttpServer(app))
        .get('/servers/local?ql=where%20type%20=%20"testdriver"')
        .expect(getBody(function(res, body){
          assert.equal(body.entities.length, 0);
          assert.deepEqual(body.class, ['server', 'search-results']);
        }))
        .end(done);
    });
  });

  describe('proxied queries on /servers/<id>', function() {
    var app = null;
    var cluster = null;

    beforeEach(function(done) {
      cluster = zettacluster({ zetta: zetta })
        .server('cloud')
        .server('detroit1', [Scout], ['cloud'])
        .on('ready', function() {
          app = cluster.servers['cloud'];
          done();
        })
        .run(function(err){
          if (err) {
            return done(err);
          }
        });
 
    });
    
    it('should have two classes', function(done) {
      request(getHttpServer(app))
        .get('/servers/detroit1?ql=where%20type%20=%20"testdriver"')
        .expect(getBody(function(res, body){
          assert.deepEqual(body.class, ['server', 'search-results']);
        }))
        .end(done);
    });

    it('should have two properties: server name and ql', function(done) {
      request(getHttpServer(app))
        .get('/servers/detroit1?ql=where%20type%20=%20"testdriver"')
        .expect(getBody(function(res, body) {
          assert.equal(body.properties.name, 'detroit1');
          assert.equal(body.properties.ql, 'where type = "testdriver"');
        }))
        .end(done);
    });

    it('should have one action.', function(done) {
      request(getHttpServer(app))
        .get('/servers/detroit1?ql=where%20type%20=%20"testdriver"')
        .expect(getBody(function(res, body) {
          assert.equal(body.actions.length, 1);
          assert.equal(body.actions[0].name, 'query-devices');
        }))
        .end(done);
    });

    it('should have a websocket link to monitor the query.', function(done) {
      request(getHttpServer(app))
        .get('/servers/detroit1?ql=where%20type%20=%20"testdriver"')
        .expect(getBody(function(res, body) {
          assert.equal(body.links.length, 4);
          hasLinkRel(body.links, 'http://rels.zettajs.io/query');
          assert.notEqual(body.links[3].href.indexOf("topic=query%2Fwhere%20type%20%3D%20%22testdriver%22"), -1);
        }))
        .end(done);
    });
  });
});
