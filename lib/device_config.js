var DeviceConfig = module.exports = function() {
  this._name = null;
  this._type = null;
  this._state = null;
  this.streams = {};
  this.monitors = [];
  this.allowed = {};
  this.transitions = {};
};

DeviceConfig.prototype.name = function(name) {
  this._name = name;
  return this;
};

DeviceConfig.prototype.type = function(type) {
  this._type = type;
  return this;
};

DeviceConfig.prototype.state = function(state) {
  this._state = state;
  return this;
};

DeviceConfig.prototype.when = function(state, options) {
  var allow = options.allow;
  if (!allow) {
    return this;
  }

  this.allowed[state] = allow;
  return this;
};

DeviceConfig.prototype.map = function(name, handler, fields) {
  this.transitions[name] = {
    handler: handler,
    fields: fields
  };
  return this;
};

DeviceConfig.prototype.monitor = function(name) {
  this.monitors.push(name);
  return this;
};

DeviceConfig.prototype.stream = function(name, handler, options) {
  this.streams[name] = {
    handler: handler,
    options: options
  };
  return this;
};
