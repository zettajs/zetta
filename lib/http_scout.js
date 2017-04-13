const Scout = require('zetta-scout');
const util = require('util');

class HTTPScout extends Scout {
  constructor() {
    super();
    this.driverFunctions = {};
  }

  init(next) {
    next();
  }

  createHTTPDevice(type, id, name) {
    const constructor = this.driverFunctions[type];
    const deviceObject = { id, name};
    if(constructor) {
      if(id) {
        this.provision(deviceObject, constructor);
      } else {
        this.discover(constructor, arguments);
      }
      return true;
    } else {
      this.server.log(`Constructor for type: ${type} not found.`);
      return false;
    }
  }
}

module.exports = HTTPScout;

