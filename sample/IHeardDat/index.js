var zetta = require('../../zetta_runtime.js');
var Arduino = require('./devices/arduino');
var IHeardThat = require('./apps');

zetta()
  .name('local')
  .expose('*')
  .use(Arduino)
  .listen(3000, function(err) {
    if(err) {
      console.log(err);
    }
  });
