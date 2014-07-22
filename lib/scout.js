var scientist = require('./scientist');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var Scout = module.exports = function() {
  this.server = null; // set when app.use initializes it
};

// add a new device to the registry
Scout.prototype.discover = function(constructor) {
  var self = this;
  var machine = scientist.create.apply(null, arguments);
  machine._pubsub = this.server.pubsub;
  machine._log = this.server._log;
  machine = scientist.init(machine);

  // save device in persistant store
  self.server.registry.save(machine, function(err){
    self.server._jsDevices[machine.id] = machine;
    self.server.emit('deviceready', machine);
  });

};


Scout.prototype.provision = function(deviceObject, constructor) {

  // if already initiated on runtime do not create a second instnace
  if(this.server._jsDevices[deviceObject.id]) {
    return null;
  }

  var args = Array.prototype.slice.call(arguments, 1);

  // TODO: add new device code
  var machine = scientist.create.apply(null, args);
  machine._pubsub = this.server.pubsub;
  machine._log = this.server._log;

  machine.id = deviceObject.id; // must set id before machine_config runs
  machine = scientist.init(machine);
  machine.name = deviceObject.name; // must set other properties after machine_config runs

  // add to list of initiated
  this.server._jsDevices[machine.id] = machine;

  this.server.registry.save(machine, function(err){

  });

  this.server.emit('deviceready', machine);
  return machine;
};
