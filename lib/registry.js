var fs = require('fs');
var path = require('path');
var Scientist = require('./scientist');

var Registry = module.exports = function(){
  this.devices = [];
  this.json_devices = [];
  this.path = path.join(process.cwd(),'registry.json');
};

Registry.prototype.load = function(cb) {
  var self = this;

  var loadRegistry = function(buf) {
    try {
      var data = JSON.parse(buf.toString());

      if(data.devices)
        self.json_devices = data.devices;
      cb();
    } catch(err){
      cb(err);
    }
  };

  fs.readFile(this.path, function(err, buf) {
    if (err) {
      if (err.code === 'ENOENT') {
        cb();
      } else {
        return cb(err);
      }
    } else {
      loadRegistry(buf);
    }
  });
};

Registry.prototype.save = function(cb) {
  var devices = this.devices.map(function(device){
    return {
      type : device.type,
      name : device.name,
      data : device.data
    };
  });

  var data = JSON.stringify({devices : devices});
  fs.writeFile(this.path, data,cb);
};

Registry.prototype.add = function(machine,cb) {
  this.devices.push(machine);
  this.save(cb);
};

Registry.prototype.setupDevice = function() {
  var machine = Scientist.configure.apply(null,arguments);
  this.devices.push(machine);
};
