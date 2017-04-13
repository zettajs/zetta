const Agent = require('http').Agent;
const util = require('util');

class SpdyAgent extends Agent {
  constructor(options) {
    this.socket = options.socket;
    this.host = options.host;
    this.port = options.port;
    super(options);
  }

  createConnection(options) {
    return options.socket;
  }
}

module.exports = SpdyAgent;