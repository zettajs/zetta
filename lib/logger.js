var EventEmitter = require('events').EventEmitter;
var Stream = require('stream');
var util = require('util');
var colors = require('colors');
var bunyan = require('bunyan');
var Strftime = require('strftime');
var ObjectStream = require('./object_stream');

function Logger(options) {
  EventEmitter.call(this);
  if (!options) {
    options = {};
  }
  var self = this;
  this.pubsub = options.pubsub;

  var stream = new Stream();
  stream.writable = true;
  stream.write = function(obj) {
    var msg =  Strftime('%b-%d-%Y %H:%M:%S', obj.time).green + ' ' + obj.msg.blue;
    console.log(msg);
  };

  this.bunyanInstance = bunyan.createLogger({
    name: 'zetta',
    streams:[
      { type: 'raw', stream: stream }
    ]
  });
}
util.inherits(Logger, EventEmitter);

/*
 * Logger intercepts messages sent from all over the fog runtime. We format them accordingly.
 *
 */
Logger.prototype.init = function() {
  var self = this;
  this.on('log', function(event, message, d) {
    var msg = '['+event+'] ' + message;
    if(d) {
      self.bunyanInstance.info(d, msg);
    } else {
      self.bunyanInstance.info(msg);
    }
    self._sendToPubsub(msg, d);
  });

  this.on('user-log', function(msg, data) {
    self.bunyanInstance.info(data, '[user-log] '+msg);
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
