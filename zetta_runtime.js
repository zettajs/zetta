var Runtime = require('./zetta');

var exp = function(options) {
  var zetta = new Runtime(options);
  return zetta;
}

exp.Device = require('./lib/Device');
exp.Scout = require('./lib/Scout');
exp.Scientist = require('./lib/scientist');

module.exports = exp;
