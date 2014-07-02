var assert = require('assert');

var zetta = require('../zetta');
var Registry = require('./fixture/scout_test_mocks').MockRegistry;
var Scout = require('./fixture/example_scout');
var request = require('supertest');

function getHttpServer(app){
  app.httpServer.init(function(){});
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
  assert(entity.links);
}

describe('Zetta', function() {
  
  var reg = null;
  
  beforeEach(function() {
    reg = new Registry();
  });
  
  describe('/ of server', function() {
    var app = null;
    beforeEach(function() {
      app = zetta({registry: reg})
        .use(Scout)
	.name('local')
	.expose('*');
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

    it('body should contain class', function(done){
      request(getHttpServer(app))
	.get('/')
        .expect(getBody(function(res, body){
	  assert.deepEqual(body.class, ['server']);
	}))
	.end(done)
    });

    it('body should contain properties with id and name', function(done){
      request(getHttpServer(app))
	.get('/')
        .expect(getBody(function(res, body){
	  assert(body.properties.id);
	  assert(body.properties.name);
	}))
	.end(done)
    });


    it('body should contain valid entity properties', function(done){
      request(getHttpServer(app))
	.get('/')
        .expect(getBody(function(res, body){
	  assert(body.entities);
	  assert.equal(body.entities.length, 1);
	  checkDeviceOnRootUri(body.entities[0]);
	}))
	.end(done)
    });

    it('body should contain links property', function(done){
      request(getHttpServer(app))
	.get('/')
        .expect(getBody(function(res, body){
	  assert.equal(body.links.length, 1);
	}))
	.end(done)
    });



  });

});
