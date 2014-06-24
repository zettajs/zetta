var util = require('util');
var Writable = require('stream').Writable;
var pubsub = require('./pubsub_service');

var ZettaDataStream = module.exports = function(queueName, options) {
  Writable.call(this, options);
  this._writableState.objectMode = true;
  this.queueName = queueName;
};
util.inherits(ZettaDataStream, Writable);

ZettaDataStream.prototype._write = function(data) {
  pubsub.publish(this.queueName, data);
};
