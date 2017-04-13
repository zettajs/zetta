const portscanner = require('portscanner');
const async = require('async');

module.exports = find;
function find(obj, cb) {
  let startPort = obj.startingPort || 3000;
  const ports = [];
  async.until(() => ports.length > obj.count, next => {
    portscanner.findAPortNotInUse(startPort, 650000, '127.0.0.1', (error, port) => {
      if (!error) {
        startPort = ++port;
        ports.push(port);
      }
      
      next();
    });
  }, err => {
    cb(err, ports);
  });
}

