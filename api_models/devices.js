var Devices = module.exports = function() {
  this.entities = null;
  this.selfUrl = null;
};

Devices.create = function(fill) {
  fill = fill || {};

  var devices = new Devices();
  devices.entities = fill.entities;
  devices.selfUrl = fill.selfUrl;

  return devices;
};
