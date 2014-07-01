var assert = require('assert');

var zetta = require('../zetta');
var Registry = require('./fixture/scout_test_mocks').MockRegistry;
var request = require('supertest');

describe('Zetta', function() {
  
  var reg = null;
  beforeEach(function() {
    reg = new Registry();
  });
  
  it('should start a server on port 3000', function(done) {
    var app = zetta({registry: reg})
      .name('local')
      .expose('*')
      .load(function(server) {})

    var server = app.httpServer;
    server.init(function(){});
    
    request(server.server)
      .get('/devices')
      .expect('Content-Type', 'application/vnd.siren+json')
      .expect(function(res){
	var body = JSON.parse(res.text);
	assert.deepEqual(body.class, ['server']);
	assert.equal(body.entities.length, 0);
	assert(body.links)
      })
      .expect(200, done);
    



  });

});
