var zetta = require('../../zetta.js');
var Arduino = require('./devices/arduino');
var IHeardThat = require('./apps');

zetta()
  .name('local')
  .expose('*')
  .use(Arduino)
  .load(IHeardThat)
  .listen(3000, function(err) {
    if(err) {
      console.log(err);
    }
  });
