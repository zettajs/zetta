var zetta = require('../../');

// allows a user to use any logger
var winston = require('winston');

// or

var bunyan = require('bunyan').createLogger({name: 'myapp'});

zetta()

  .logs(function(log) {
    // logs passes an internal logs object.
    
    log.on('log', function(type, msg, data) {
      // type = info/warn/error
      // msg = "Websocket connection for peer "local" established."
      // data.component = http_server
      // data.date = ...
    });
    
    // follows above but filters on type
    log.on('info', function(msg, data) {
      winston.info(msg, data);
    });

    log.on('warn', function(msg, data) {
      bunyan.log(data, msg); // bunyan does it the other way.
    });

    log.on('error', function(msg, data) {
    });

  })
  .listen(3000);
