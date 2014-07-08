var zetta = require('../../zetta_runtime.js');
var Arduino = require('./devices/arduino');
var IHeardThat = require('./apps');

var app = zetta();
app.id = 'dfffbb4c-038f-45e2-a484-042d15881ede';

app
  .name('local')
  .expose('*')
  .use(Arduino)
  .listen(3000, function(err) {
    if(err) {
      console.log(err);
    }
  });
