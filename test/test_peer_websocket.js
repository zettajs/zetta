var assert = require('assert');
var https = require('https');
var http = require('http');
var fs = require('fs');
var WebSocketServer = require('ws').Server;
var Websocket = require('../lib/web_socket');

describe('Peer Client Websocket', function() {

  it('it should connect to ws:// server', function(done) {
    var server = http.createServer();
    var wss = new WebSocketServer({ server: server });
    server.listen(0, function(err) {
      if (err) {
        return done(err);
      }
      var address = 'ws://localhost:' + server.address().port;
      var ws = new Websocket(address);
      ws.on('error', done);
      ws.on('open', function() {
        done();
      });
    });
  });

  it('it should connect to wss:// server', function(done) {
    var opts = {
      key: fs.readFileSync('./test/fixture/server.key'),
      cert: fs.readFileSync('./test/fixture/server.crt')
    };

    var server = https.createServer(opts);
    var wss = new WebSocketServer({ server: server });
    server.listen(0, function(err) {
      if (err) {
        return done(err);
      }

      var address = 'wss://localhost:' + server.address().port;
      var ws = new Websocket(address, { rejectUnauthorized: false});
      ws.on('error', done);
      ws.on('open', function() {
        done();
      });
    });
  });

});
