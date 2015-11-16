var util = require('util');
var stream = require('stream');

var BufferReadStream = module.exports = function(buffer, options) {
  if (!(buffer instanceof Buffer)) {
    throw new TypeError('First agument must be a buffer.');
  }
  this._bufferToSend = buffer;
  stream.Readable.call(this, options);
};
util.inherits(BufferReadStream, stream.Readable);

BufferReadStream.prototype._read = function() {
  this.push(this._bufferToSend);
  this._bufferToSend = null;
};

module.exports.createReadStream = function(buffer, options) {
  return new BufferReadStream(buffer, options);
};

