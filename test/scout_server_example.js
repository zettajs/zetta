var util = require('util');
var Registry = require('../lib/registry');
var scientist = require('../lib/scientist');
var Scout = require('../zetta_runtime').Scout;
var HueScout = require('./fixture/example_scout.js');


function Server() {
  this.registry = new Registry();
  this._jsDevices = {};
};
Server.prototype.where = function(q) {return q;};
Server.prototype.observe = function() {};
Server.prototype.find = function(q) {
  return this.registry.find.apply(this.registry, arguments);
};



var App = function(){
  this.server = new Server();
};

App.prototype.use = function(constructor){
  
  var scout = scientist.create.apply(null, arguments);
  scout.server = this.server;
  
  scout.init(function(err){
    console.log('init done')
  });

};

var app = new App();
app.use(HueScout);

