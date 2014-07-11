var EventEmitter = require('events').EventEmitter;
var Stream = require('stream');
var util = require('util');
var colors = require('colors');
var bunyan = require('bunyan');
var Strftime = require('strftime');

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

  var pumperStream = new Stream();
  pumperStream.writable = true;
  pumperStream.write = function(obj) {
    if (self.pubsub) {
      obj.unixtime = obj.time.getTime();
      self.pubsub.publish('_logs', obj);
    }
  };

  this.bunyanInstance = bunyan.createLogger({
    name: 'zetta',
    streams:[
      { type: 'raw', stream: stream },
      { type: 'raw', stream: pumperStream }
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
  });

  this.on('user-log', function(msg, data) {
    self.bunyanInstance.info(data, '[user-log] '+msg);
  });
};

var logger = null;

module.exports = function() {
  if(logger) {
    return logger;
  } else {
    logger = new Logger();
    logger.init();
    return logger;
  }
};
