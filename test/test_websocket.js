var assert = require('assert');
var http = require('http');
var WebSocket = require('../lib/web_socket');

describe('Web Socket', function() {

  describe('Connection', function() {
    
    it('should emit close when non-upgrade response is sent', function(done) {
      var server = http.createServer();
      server.on('upgrade', function(request, socket, head) {
        socket.end('HTTP/1.1 500 Internal Server Error\r\n\r\n\r\n');
      }).listen(0, function() {
        var ws = new WebSocket('http://localhost:' + server.address().port);
        ws.on('close', function(code) {
          done();
        });
      });
    })
    
  });

});
