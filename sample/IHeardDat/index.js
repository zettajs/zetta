var zetta = require('../../zetta.js');
var Arduino = require('./devices/arduino');
var IHeardThat = require('./apps');

zetta()
  .name('local')
  .use(Arduino)
  .link('http://localhost:1337')
  .listen(3000, function(err) {
    if(err) {
      console.log(err);
    }
  });
