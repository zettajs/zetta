var portscanner = require('portscanner');
var async = require('async');

module.exports = find;
function find(obj, cb) {
  var startPort = obj.startingPort || 3000;
  var ports = [];
  async.until(function(){
    return ports.length > obj.count;
  }, function(next) {
    portscanner.findAPortNotInUse(startPort, 650000, '127.0.0.1', function(error, port) {
      if (!error) {
        startPort = ++port;
        ports.push(port);
      }
      
      next();
    });
  }, function(err) {
    cb(err, ports);
  });
}

