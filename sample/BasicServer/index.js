var zetta = require('../../zetta_runtime.js');
var Arduino = require('./devices/arduino');
var Spark = require('./devices/spark');
var iPhone = require('./devices/iphone');
var app = require('./apps');

zetta()
  .name('BasicServer')
  .expose('*')
  .use(Arduino)
  .use(Spark)
  .use(iPhone, {http_device: true})
  .use(app)
  .listen(3002, function(err) {
    if(err) {
      console.log(err);
    }
  });
