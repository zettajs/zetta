const assert = require('assert');
const https = require('https');
const http = require('http');
const fs = require('fs');
const WebSocketServer = require('ws').Server;
const Websocket = require('../lib/web_socket');

describe('Peer Client Websocket', () => {

  it('it should connect to ws:// server', done => {
    const server = http.createServer();
    const wss = new WebSocketServer({ server });
    server.listen(0, err => {
      if (err) {
        return done(err);
      }
      const address = `ws://localhost:${server.address().port}`;
      const ws = new Websocket(address);
      ws.on('error', done);
      ws.on('open', () => {
        done();
      });

      ws.start();
    });
  });

  it('it should connect to wss:// server', done => {
    const opts = {
      key: fs.readFileSync('./test/fixture/server.key'),
      cert: fs.readFileSync('./test/fixture/server.crt')
    };

    const server = https.createServer(opts);
    const wss = new WebSocketServer({ server });
    server.listen(0, err => {
      if (err) {
        return done(err);
      }

      const address = `wss://localhost:${server.address().port}`;
      const ws = new Websocket(address, { rejectUnauthorized: false});
      ws.on('error', done);
      ws.on('open', () => {
        done();
      });

      ws.start();
    });
  });

});
