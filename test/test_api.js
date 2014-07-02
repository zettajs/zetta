var assert = require('assert');

var zetta = require('../zetta');
var Registry = require('./fixture/scout_test_mocks').MockRegistry;
var Scout = require('./fixture/example_scout');
var request = require('supertest');

function getHttpServer(app){
  return app.httpServer.server;
}

function getBody(fn){
  return function(res){
    try {
      var body = JSON.parse(res.text);
    }catch(err){
      throw new Error('Failed to parse json body');
    }

    fn(res, body);
  }
}

function checkDeviceOnRootUri(entity){
  assert.deepEqual(entity.class, ['device']);
  assert.deepEqual(entity.rel, ['http://rels.zettajs.io/device']);
  assert(entity.properties.id);
  assert(entity.properties.name);
  assert(entity.properties.type);
  assert(entity.properties.state);
  assert(!entity.actions); // should not have actions on it

  assert(entity.links);
  hasLinkRel(entity.links, 'self');
  hasLinkRel(entity.links, 'http://rels.zettajs.io/server');
}

function hasLinkRel(links, rel, title, href){
  var found = false;
  links.forEach(function(link){
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
  
  beforeEach(function() {
    reg = new Registry();
  });
  
  describe.skip('/ of server', function() {
    var app = null;
    beforeEach(function() {
      app = zetta({registry: reg})
        .use(Scout)
	.name('local')
	.expose('*')
        ._run();
    });

    it('should have content type application/vnd.siren+json', function(done){
      request(getHttpServer(app))
	.get('/')
	.expect('Content-Type', 'application/vnd.siren+json', done);
    });

    it('should have status code 200', function(done){
      request(getHttpServer(app))
	.get('/')
	.expect(200, done);
    });

    it('body should contain class ["root"]', function(done){
      request(getHttpServer(app))
	.get('/')
        .expect(getBody(function(res, body){
	  assert.deepEqual(body.class, ['root']);
	}))
	.end(done)
    });


    it('body should contain links property', function(done){
      request(getHttpServer(app))
	.get('/')
        .expect(getBody(function(res, body){
	  assert.equal(body.links.length, 2);
	  hasLinkRel(body.links, 'self');
	}))
	.end(done)
    });

    it('links should contain rel to server', function(done){
      request(getHttpServer(app))
	.get('/')
        .expect(getBody(function(res, body){
	  hasLinkRel(body.links, 'http://rels.zettajs.io/server');
	}))
	.end(done)
    });

  });




  describe('/devices of server', function() {
    var app = null;
    beforeEach(function(done) {
      app = zetta({registry: reg})
        .use(Scout)
	.name('local')
	.expose('*')
        ._run(done);
    });

    it('should have content type application/vnd.siren+json', function(done){
      request(getHttpServer(app))
	.get('/devices')
	.expect('Content-Type', 'application/vnd.siren+json', done);
    });

    it('should return status code 200', function(done){
      request(getHttpServer(app))
	.get('/devices')
        .expect(200, done);
    });

    it('should have class ["devices"]', function(done){
      request(getHttpServer(app))
	.get('/devices')
        .expect(getBody(function(res, body){
	  assert.deepEqual(body.class, ['devices']);
	}))
        .end(done);
    });

    it('should have one valid entity', function(done){
      request(getHttpServer(app))
	.get('/devices')
        .expect(getBody(function(res, body){
	  assert(body.entities);
	  assert.equal(body.entities.length, 1);
	  checkDeviceOnRootUri(body.entities[0]);
	  hasLinkRel(body.links, 'self');
	}))
        .end(done);
    });
  });


});
