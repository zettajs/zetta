var util = require('util');
var Writable = require('stream').Writable;

var ObjectStream = module.exports = function(queueName, options, pubsub) {
  Writable.call(this, options);
  this._writableState.objectMode = true;
  this.queueName = queueName;
  this._pubsub = pubsub;
};
util.inherits(ObjectStream, Writable);

ObjectStream.prototype._write = function(data, encoding, callback) {
  this._pubsub.publish(this.queueName, data);
  callback();
};
