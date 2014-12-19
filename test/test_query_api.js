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
var zettatest = require('./fixture/zetta_test');

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

    it('should have two two actions.', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"')
        .expect(getBody(function(res, body) {
          assert.equal(body.actions.length, 2);
          assert.equal(body.actions[0].name, 'register-device');
          assert.equal(body.actions[1].name, 'query-devices');
        }))
        .end(done);
    });

    it('should have a websocket link to monitor the query.', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"')
        .expect(getBody(function(res, body) {
          assert.equal(body.links.length, 3);
          hasLinkRel(body.links, 'http://rels.zettajs.io/query');
          assert.notEqual(body.links[2].href.indexOf("topic=query%2Fwhere%20type%20%3D%20%22testdriver%22"), -1);
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

    it('should have two two actions.', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=local')
        .expect(getBody(function(res, body) {
          assert.equal(body.actions.length, 2);
          assert.equal(body.actions[0].name, 'register-device');
          assert.equal(body.actions[1].name, 'query-devices');
        }))
        .end(done);
    });

    it('should have a websocket link to monitor the query.', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=local')
        .expect(getBody(function(res, body) {
          assert.equal(body.links.length, 3);
          hasLinkRel(body.links, 'http://rels.zettajs.io/query');
          assert.notEqual(body.links[2].href.indexOf("topic=query%2Fwhere%20type%20%3D%20%22testdriver%22"), -1);
        }))
        .end(done);
    });
  });
  
  describe('queries on / with a ql parameter and a server parameter that is proxied to', function() {
    var app = null;
    var cluster = null;

    beforeEach(function(done) {
      cluster = zettatest()
      .server('cloud')
      .server('detroit1', [Scout], ['cloud'])
      .run(function(err){
        if (err) {
          return done(err);
        }

        app = cluster.servers['cloud'];
        done();

      });
 
    });

    it('should have two classes', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=detroit1')
        .expect(getBody(function(res, body){
          assert.deepEqual(body.class, ['server', 'search-results']);
        }))
        .end(done);
    });

    it('should have two properties: server name and ql', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=detroit1')
        .expect(getBody(function(res, body) {
          assert.equal(body.properties.name, 'detroit1');
          assert.equal(body.properties.ql, 'where type = "testdriver"');
        }))
        .end(done);
    });

    it('should have two two actions.', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=detroit1')
        .expect(getBody(function(res, body) {
          assert.equal(body.actions.length, 2);
          assert.equal(body.actions[0].name, 'register-device');
          assert.equal(body.actions[1].name, 'query-devices');
        }))
        .end(done);
    });

    it('should have a websocket link to monitor the query.', function(done) {
      request(getHttpServer(app))
        .get('/?ql=where%20type%20=%20"testdriver"&server=detroit1')
        .expect(getBody(function(res, body) {
          assert.equal(body.links.length, 3);
          hasLinkRel(body.links, 'http://rels.zettajs.io/query');
          assert.notEqual(body.links[2].href.indexOf("topic=query%2Fwhere%20type%20%3D%20%22testdriver%22"), -1);
        }))
        .end(done);
    });
  });
 
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

    it('should have two two actions.', function(done) {
      request(getHttpServer(app))
        .get('/servers/local?ql=where%20type%20=%20"testdriver"')
        .expect(getBody(function(res, body) {
          assert.equal(body.actions.length, 2);
          assert.equal(body.actions[0].name, 'register-device');
          assert.equal(body.actions[1].name, 'query-devices');
        }))
        .end(done);
    });

    it('should have a websocket link to monitor the query.', function(done) {
      request(getHttpServer(app))
        .get('/servers/local?ql=where%20type%20=%20"testdriver"')
        .expect(getBody(function(res, body) {
          assert.equal(body.links.length, 3);
          hasLinkRel(body.links, 'http://rels.zettajs.io/query');
          assert.notEqual(body.links[2].href.indexOf("topic=query%2Fwhere%20type%20%3D%20%22testdriver%22"), -1);
        }))
        .end(done);
    });
  });

  describe('proxied queries on /servers/<id>', function() {
    var app = null;
    var cluster = null;

    beforeEach(function(done) {
      cluster = zettatest()
      .server('cloud')
      .server('detroit1', [Scout], ['cloud'])
      .run(function(err){
        if (err) {
          return done(err);
        }

        app = cluster.servers['cloud'];
        done();

      });
 
    });    it('should have two classes', function(done) {
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

    it('should have two two actions.', function(done) {
      request(getHttpServer(app))
        .get('/servers/detroit1?ql=where%20type%20=%20"testdriver"')
        .expect(getBody(function(res, body) {
          assert.equal(body.actions.length, 2);
          assert.equal(body.actions[0].name, 'register-device');
          assert.equal(body.actions[1].name, 'query-devices');
        }))
        .end(done);
    });

    it('should have a websocket link to monitor the query.', function(done) {
      request(getHttpServer(app))
        .get('/servers/detroit1?ql=where%20type%20=%20"testdriver"')
        .expect(getBody(function(res, body) {
          assert.equal(body.links.length, 3);
          hasLinkRel(body.links, 'http://rels.zettajs.io/query');
          assert.notEqual(body.links[2].href.indexOf("topic=query%2Fwhere%20type%20%3D%20%22testdriver%22"), -1);
        }))
        .end(done);
    });
  });
});
