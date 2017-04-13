const Agent = require('http').Agent;
const util = require('util');

const SpdyAgent = module.exports = function(options) {
  this.socket = options.socket;
  this.host = options.host;
  this.port = options.port;
  Agent.call(this, options);
};
util.inherits(SpdyAgent, Agent);

SpdyAgent.prototype.createConnection = options => options.socket;
