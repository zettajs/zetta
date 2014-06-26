var Scout = require('../../../../zetta_runtime').Scout;
var SparkDriver = require('./spark_driver');
var util = require('util');

var vendorId = '1234567';

var SparkScout = module.exports = function() {
  Scout.call(this);
}
util.inherits(SparkScout, Scout);

SparkScout.prototype.init = function(cb) {
  var self = this;

  var sparkQuery = this.server.where({type:'spark', vendorId:'1234567'});

  self.server.find(sparkQuery, function(err, results){
    if(!err) {
      if(results.length) {
        self.provision(results[0], SparkDriver);
        cb();
      } else {

        setTimeout(function(){
          self.discover(SparkDriver);
        }, 3000);
        cb();
      }
    } else {
      console.log('error:');
      console.log(err);
    }

  });
}
