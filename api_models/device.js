var Device = module.exports = function() {
  this.id = null;
  this.name = null;
  this.selfUrl = null;
  this.collectionUrl = null;
};

Device.create = function(fill) {
  fill = fill || {};

  var device = new Device();
  device.name = fill.name;
  device.selfUrl = fill.selfUrl;
  device.collectionUrl = fill.collectionUrl;
  return device;
};
