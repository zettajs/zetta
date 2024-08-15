var Agent = require('http').Agent;
var util = require('util');

var SpdyAgent = module.exports = function(options) {
  this.socket = options.socket;
  this.host = options.host;
  this.port = options.port;
  Agent.call(this, options);
};
util.inherits(SpdyAgent, Agent);

SpdyAgent.prototype.createConnection = function(options) {
  // Needs to emit connect in the next pass of the event loop
  setImmediate(function() {
    options.socket.emit('connect');
  });
  return options.socket;
};
