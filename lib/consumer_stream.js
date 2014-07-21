var util = require('util');
var Readable = require('stream').Readable;

var ConsumerStream = module.exports = function(queueName, options, pubsub) {
  Readable.call(this, options);
  this.queueName = queueName;
  this._pubsub = pubsub;
  this.listener = null;
};
util.inherits(ConsumerStream, Readable);

ConsumerStream.prototype._read = function(size) {
  var self = this;
  if (!this.listener) {
    this.listener = function(topic, data) {
      if (!self.push(data)) {
        self.pubsub.unsubscribe(self.qeueueName, self.listener);
        self.listener = null;
      }
    }
    this._pubsub.subscribe(this.queueName, this.listener);
  }
};
