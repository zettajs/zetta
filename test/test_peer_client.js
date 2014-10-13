var PeerClient = require('../lib/peer_client');
var assert = require('assert');


var MockServer = { _name: '1234', httpServer: { spdyServer: {}}, log: {}};
var urlEndingWithSlash = 'http://cloud.zettajs.io/';
var urlEndingWithNoSlash = 'http://cloud.zettajs.io';

describe('Peer Client', function() {
  describe('url parsing', function() {
    it('should calculate the proper url with a trailing slash', function() {
      var client = new PeerClient(urlEndingWithSlash, MockServer);
      assert.equal(client.url, 'ws://cloud.zettajs.io/peers/1234');
    });

    it('should calculate the proper url without a trailing slash', function() {
      var client = new PeerClient(urlEndingWithNoSlash, MockServer); 
      assert.equal(client.url, 'ws://cloud.zettajs.io/peers/1234');
    });
  });
});
