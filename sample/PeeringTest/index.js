var zetta = require('../../zetta.js');

zetta()
  .link('http://127.0.0.1:3030/')
  .link('http://hello-zetta.herokuapp.com/')
  .listen(1337);
