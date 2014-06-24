var uuid = require('node-uuid');

var Device = module.exports = function(){
  this.id = uuid.v4();
};

