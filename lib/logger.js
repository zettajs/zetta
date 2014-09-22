var EventEmitter = require('events').EventEmitter;
var Stream = require('stream');
var util = require('util');
var colors = require('colors');
var Strftime = require('strftime');
var ObjectStream = require('zetta-streams').ObjectStream;

function Logger(options) {
  EventEmitter.call(this);
  this.options = options || {};
  this.pubsub = options.pubsub;
}
util.inherits(Logger, EventEmitter);

Logger.prototype._consoleLog = function(msg) {
  if (this.options.quite) {
    return;
  }

  var date = new Date();
  console.log(Strftime('%b-%d-%Y %H:%M:%S', date).green + ' ' + msg.blue);
};

/*
 * Logger intercepts messages sent from all over the fog runtime. We format them accordingly.
 *
 */
Logger.prototype.init = function() {
  var self = this;
  this.on('log', function(event, message, d) {
    var msg = '['+event+'] ' + message;
    self._consoleLog(msg);
    self._sendToPubsub(msg, d);
  });

  this.on('user-log', function(msg, data) {
    self._consoleLog(msg);
    self._sendToPubsub('[user-log] ' + msg, data);
  });
};

Logger.prototype._sendToPubsub = function(msg, data) {
  if (!data) {
    data = {};
  }

  var obj = ObjectStream.format((data.topic || 'logs'), null);
  delete obj.data; // only used for objectstream messages

  Object.keys(data).forEach(function(key) {
    obj[key] = data[key];
  });

  if (msg) {
    obj.msg = msg;
  }

  this.pubsub.publish('logs', obj);
};

var logger = null;

module.exports = function() {
  if(logger) {
    return logger;
  } else {
    logger = Object.create(Logger.prototype);
    logger.constructor.apply(logger, arguments);
    logger.init();
    return logger;
  }
};
