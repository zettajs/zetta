var Agent = require('http').Agent;
var util = require('util');

var FogAgent = module.exports = function(options) {
  this.socket = options.socket;
  this.host = options.host;
  this.port = options.port;
  Agent.call(this, options);
};
util.inherits(FogAgent, Agent);

FogAgent.prototype.createConnection = function(options) {
  return options.socket;
};
